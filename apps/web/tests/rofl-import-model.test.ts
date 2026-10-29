import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { prepareRoflImport, type RoflImportContext } from '../src/lib/server/rofl/import-model.ts';

const ids = {
	scrim: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	match: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	game: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	teamA: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
	teamB: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
	participantA: '11111111-aaaa-aaaa-aaaa-111111111111',
	participantB: '22222222-bbbb-bbbb-bbbb-222222222222',
	accountA: '33333333-cccc-cccc-cccc-333333333333',
	accountB: '44444444-dddd-dddd-dddd-444444444444'
};

function fixture(players: Record<string, unknown>[] = [
	{ RIOT_ID_GAME_NAME: 'Example', RIOT_ID_TAG_LINE: '0012', PUUID: 'opaque-replay-value', TEAM: '100', WIN: 'Win', SKIN: 'Ahri' },
	{ TEAM: '200', WIN: 'Fail', SKIN: 'Ashe' }
]) {
	const version = Buffer.from('16.21.829.8620');
	const header = Buffer.alloc(15 + version.length);
	header.write('RIOT'); header.writeUInt16LE(2, 4); header[14] = version.length; version.copy(header, 15);
	const metadata = Buffer.from(JSON.stringify({
		gameLength: 120_000, statsJson: JSON.stringify(players),
		unknownMetadata: 'raw-metadata-must-not-survive', gameId: 'untrusted-game-id'
	}));
	const length = Buffer.alloc(4); length.writeUInt32LE(metadata.length);
	return Buffer.concat([header, Buffer.alloc(256), metadata, length]);
}

function context(): RoflImportContext {
	return {
		guildId: 'guild-1', scrimId: ids.scrim, matchId: ids.match, gameId: ids.game, gameNumber: 2,
		uploadedByUserId: 'uploader-1', uploadedAt: new Date('2026-10-28T12:00:00Z')
	};
}

test('선별 데이터를 같은 메타 ID의 공통 행과 V1 하위 행으로 연결한다', () => {
	const bytes = fixture();
	const input = context();
	input.teams = [{ replayTeamId: 100, teamId: ids.teamB }, { replayTeamId: 200, teamId: ids.teamA }];
	input.participants = [{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: ids.accountA }];
	const data = prepareRoflImport(bytes, input);
	const roflMetadataId = data.rows.metadata.id;
	assert.match(roflMetadataId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	assert.equal('status' in data, false);
	assert.deepEqual(data.registration, {
		guildId: 'guild-1', scrimId: ids.scrim, matchId: ids.match, gameId: ids.game, gameNumber: 2
	});
	assert.equal(data.rows.projectionVersion, 1);
	assert.deepEqual(data.rows.metadata, {
		id: roflMetadataId, fileSha256: createHash('sha256').update(bytes).digest('hex'),
		fileSizeBytes: bytes.length, formatVersion: 2, gameVersion: '16.21.829.8620', projectionVersion: 1,
		uploadedByUserId: 'uploader-1', uploadedAt: new Date('2026-10-28T12:00:00Z')
	});
	assert.deepEqual(data.rows.participants, [{ roflMetadataId, participantIndex: 0 }, { roflMetadataId, participantIndex: 1 }]);
	assert.deepEqual(data.rows.gameData, {
		roflMetadataId, projectionVersion: 1, gameLengthMs: 120_000, resultStatus: 'consistent',
		winnerReplayTeamId: 100, teams: [{ teamId: 100, win: true }, { teamId: 200, win: false }]
	});
	assert.equal(data.rows.participantData.length, 2);
	for (const [participantIndex, row] of data.rows.participantData.entries()) {
		assert.equal(row.roflMetadataId, roflMetadataId);
		assert.equal(row.participantIndex, participantIndex);
	}
	const first = data.rows.participantData[0];
	assert.equal(first.gameName, 'Example');
	assert.equal(first.tagLine, '0012');
	assert.equal(first.replayPuuid, 'opaque-replay-value');
	assert.equal(first.champion, 'Ahri');
	assert.equal(first.replayTeamId, 100);
	assert.equal(first.win, true);
	assert.deepEqual(data.links, {
		teams: [{ replayTeamId: 100, teamId: ids.teamB }, { replayTeamId: 200, teamId: ids.teamA }],
		participants: [
			{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: ids.accountA },
			{ participantIndex: 1, scrimParticipantId: null, riotAccountId: null }
		]
	});
});

test('원본 바이트·보관 경로·전체 메타데이터와 운영 결과를 적재 행에 섞지 않는다', () => {
	const bytes = fixture([
		{ TEAM: '100', WIN: 'Win', UNKNOWN_FIELD: 'raw-participant-must-not-survive', INDIVIDUAL_POSITION: 'TOP', BARON_KILLS: '3', playerId: 'untrusted-player' },
		{ TEAM: '200', WIN: 'Fail' }
	]);
	const data = prepareRoflImport(bytes, context());
	assert.deepEqual(Object.keys(data).sort(), ['links', 'registration', 'rows']);
	assert.deepEqual(Object.keys(data.rows).sort(), ['gameData', 'metadata', 'participantData', 'participants', 'projectionVersion']);
	assert.deepEqual(Object.keys(data.rows.participantData[0]).sort(), [
		'champion', 'gameName', 'loadout', 'participantIndex', 'replayPuuid', 'replayTeamId',
		'roflMetadataId', 'stats', 'tagLine', 'win'
	]);
	const serialized = JSON.stringify(data);
	for (const omitted of [
		'replayStorageKey', 'metadataStorageKey', 'metadataSha256', 'metadataBytes', 'raw-metadata-must-not-survive',
		'raw-participant-must-not-survive', 'UNKNOWN_FIELD', 'INDIVIDUAL_POSITION', 'BARON_KILLS',
		'untrusted-', 'statsJson', 'winnerSide', 'championId', 'startedAt', 'endedAt'
	]) assert.equal(serialized.includes(omitted), false, omitted);
	function assertNoBytes(value: unknown): void {
		assert.equal(ArrayBuffer.isView(value), false);
		assert.equal(value instanceof ArrayBuffer, false);
		if (value !== null && typeof value === 'object') Object.values(value).forEach(assertNoBytes);
	}
	assertNoBytes(data);
});

test('V1 통계의 실제 0과 누락 null 및 장비 슬롯 순서를 유지한다', () => {
	const data = prepareRoflImport(fixture([
		{},
		{ CHAMPIONS_KILLED: '0', NUM_DEATHS: 0, ASSISTS: null, TOTAL_TIME_CROWD_CONTROL_DEALT: '27',
			ITEM0: '0', ITEM2: '17', ITEM6: '3340', SUMMONER_SPELL_2: '4', PERK1: '8009', STAT_PERK_2: '5002' }
	]), context());
	const [empty, partial] = data.rows.participantData;
	assert.equal(Object.keys(empty.stats).length, 33);
	assert.ok(Object.values(empty.stats).every((value) => value === null));
	assert.equal(partial.stats.kills, 0);
	assert.equal(partial.stats.deaths, 0);
	assert.equal(partial.stats.assists, null);
	assert.equal(partial.stats.totalTimeCrowdControlDealt, 27);
	assert.deepEqual(partial.loadout, {
		itemIds: [0, null, 17, null, null, null, 3340], summonerSpellIds: [null, 4],
		primaryRuneStyleId: null, secondaryRuneStyleId: null,
		runeIds: [null, 8009, null, null, null, null], statRuneIds: [null, null, 5002]
	});
	assert.equal(empty.gameName, null);
	assert.equal(empty.replayTeamId, null);
	assert.equal(empty.win, null);
});

test('원본과 호출자 문맥을 변경하지 않고 반환 후에도 참조를 공유하지 않는다', () => {
	const bytes = fixture();
	const padded = Buffer.concat([Buffer.alloc(11, 7), bytes, Buffer.alloc(7, 9)]);
	const paddedBefore = Buffer.from(padded);
	const view = padded.subarray(11, 11 + bytes.length);
	const input = context();
	input.teams = [{ replayTeamId: 100, teamId: ids.teamA }];
	input.participants = [{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: ids.accountA }];
	const contextBefore = structuredClone(input);
	const data = prepareRoflImport(view, input);
	assert.deepEqual(input, contextBefore);
	assert.deepEqual(padded, paddedBefore);
	assert.equal(data.rows.metadata.fileSizeBytes, bytes.length);
	assert.equal(data.rows.metadata.fileSha256, createHash('sha256').update(bytes).digest('hex'));
	assert.notEqual(data.rows.metadata.uploadedAt, input.uploadedAt);
	const dataBefore = structuredClone(data);
	input.teams[0].teamId = ids.teamB;
	input.participants[0].scrimParticipantId = ids.participantB;
	input.participants[0].riotAccountId = ids.accountB;
	input.uploadedAt.setFullYear(2000);
	view.fill(0);
	assert.deepEqual(data, dataBefore);
});

test('적재 준비 함수는 제공되지 않은 서비스 연결을 임의로 만들지 않는다', () => {
	const data = prepareRoflImport(fixture(), context());
	assert.equal('status' in data, false);
	assert.ok(data.links.teams.every(({ teamId }) => teamId === null));
	assert.ok(data.links.participants.every(({ scrimParticipantId, riotAccountId }) => scrimParticipantId === null && riotAccountId === null));
	assert.equal(data.rows.gameData.winnerReplayTeamId, 100);
	assert.equal(data.rows.participantData[0].replayPuuid, 'opaque-replay-value');
});

test('정보가 불완전하거나 충돌하면 승자를 만들지 않고 결과 상태를 유지한다', () => {
	for (const [players, resultStatus] of [
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '200' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '200', WIN: 'Win' }], 'conflicting']
	] as const) {
		const data = prepareRoflImport(fixture([...players]), context());
		assert.equal('status' in data, false);
		assert.equal(data.rows.gameData.resultStatus, resultStatus);
		assert.equal(data.rows.gameData.winnerReplayTeamId, null);
		assert.equal(data.rows.participantData.length, 2);
	}
});

test('20명과 희소한 참가자 데이터도 인덱스 손실 없이 보존한다', () => {
	const players = Array.from({ length: 20 }, (_, index) => index % 3 === 0
		? {} : { TEAM: index < 10 ? '100' : '200', WIN: index < 10 ? 'Win' : 'Fail' });
	const data = prepareRoflImport(fixture(players), {
		...context(), participants: [{ participantIndex: 19, scrimParticipantId: ids.participantA, riotAccountId: null }]
	});
	const indices = Array.from({ length: 20 }, (_, index) => index);
	assert.deepEqual(data.rows.participants.map(({ participantIndex }) => participantIndex), indices);
	assert.deepEqual(data.rows.participantData.map(({ participantIndex }) => participantIndex), indices);
	assert.deepEqual(data.links.participants[19], { participantIndex: 19, scrimParticipantId: ids.participantA, riotAccountId: null });
	assert.ok(data.links.participants.slice(0, 19).every(({ scrimParticipantId }) => scrimParticipantId === null));
	assert.equal(data.rows.gameData.resultStatus, 'incomplete');
});

test('UUID 대소문자를 정규화하고 DB integer 범위의 Game 순번을 받는다', () => {
	const data = prepareRoflImport(fixture(), {
		...context(), scrimId: ids.scrim.toUpperCase(), matchId: ids.match.toUpperCase(),
		gameId: ids.game.toUpperCase(), gameNumber: 2_147_483_647,
		teams: [{ replayTeamId: 100, teamId: ids.teamA.toUpperCase() }],
		participants: [{ participantIndex: 0, scrimParticipantId: ids.participantA.toUpperCase(), riotAccountId: ids.accountA.toUpperCase() }]
	});
	assert.deepEqual(data.registration, {
		guildId: 'guild-1', scrimId: ids.scrim, matchId: ids.match, gameId: ids.game, gameNumber: 2_147_483_647
	});
	assert.equal(data.links.teams[0].teamId, ids.teamA);
	assert.equal(data.links.participants[0].scrimParticipantId, ids.participantA);
	assert.equal(data.links.participants[0].riotAccountId, ids.accountA);
});

test('존재하지 않는 원본 대상이나 중복 원본 인덱스 연결을 거부한다', () => {
	const changes: Partial<RoflImportContext>[] = [
		{ teams: [{ replayTeamId: 300, teamId: ids.teamA }] },
		{ teams: [{ replayTeamId: 100, teamId: ids.teamA }, { replayTeamId: 100, teamId: ids.teamB }] },
		...[-1, 2, 0.5].map((participantIndex) => ({ participants: [{ participantIndex, scrimParticipantId: ids.participantA, riotAccountId: null }] })),
		{ participants: [
			{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: null },
			{ participantIndex: 0, scrimParticipantId: ids.participantB, riotAccountId: null }
		] }
	];
	for (const change of changes) {
		assert.throws(() => prepareRoflImport(fixture(), { ...context(), ...change }), { code: 'INVALID_IMPORT_CONTEXT' });
	}
});

test('동일 서비스 팀·참가자·계정으로 여러 원본 대상을 연결하지 않는다', () => {
	const changes: Partial<RoflImportContext>[] = [
		{ teams: [{ replayTeamId: 100, teamId: ids.teamA }, { replayTeamId: 200, teamId: ids.teamA.toUpperCase() }] },
		{ participants: [
			{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: null },
			{ participantIndex: 1, scrimParticipantId: ids.participantA.toUpperCase(), riotAccountId: null }
		] },
		{ participants: [
			{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: ids.accountA },
			{ participantIndex: 1, scrimParticipantId: ids.participantB, riotAccountId: ids.accountA.toUpperCase() }
		] }
	];
	for (const change of changes) {
		assert.throws(() => prepareRoflImport(fixture(), { ...context(), ...change }), { code: 'INVALID_IMPORT_CONTEXT' });
	}
	const data = prepareRoflImport(fixture(), {
		...context(), participants: [
			{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: null },
			{ participantIndex: 1, scrimParticipantId: ids.participantB, riotAccountId: null }
		]
	});
	assert.ok(data.links.participants.every(({ riotAccountId }) => riotAccountId === null));
});

test('잘못된 서비스 ID·날짜·DB 범위 밖의 Game 순번을 거부한다', () => {
	const changes: Partial<RoflImportContext>[] = [
		{ guildId: '' }, { uploadedByUserId: ' ' }, { scrimId: 'scrim-1' }, { matchId: '' }, { gameId: '' },
		{ gameId: ` ${ids.game}` }, { gameId: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz' },
		...[0, -1, 1.5, 2_147_483_648, Number.NaN, Number.MAX_SAFE_INTEGER + 1].map((gameNumber) => ({ gameNumber })),
		{ uploadedAt: new Date('invalid') },
		{ teams: [{ replayTeamId: 100, teamId: 'not-a-uuid' }] },
		{ participants: [{ participantIndex: 0, scrimParticipantId: 'not-a-uuid', riotAccountId: null }] },
		{ participants: [{ participantIndex: 0, scrimParticipantId: ids.participantA, riotAccountId: 'not-a-uuid' }] }
	];
	for (const change of changes) {
		assert.throws(() => prepareRoflImport(fixture(), { ...context(), ...change }), { code: 'INVALID_IMPORT_CONTEXT' });
	}
});

test('같은 파일로 준비한 적재 데이터는 같은 지문과 독립된 메타 ID를 가진다', () => {
	const bytes = fixture();
	const first = prepareRoflImport(bytes, context());
	const second = prepareRoflImport(bytes, context());
	assert.equal(first.rows.metadata.fileSha256, second.rows.metadata.fileSha256);
	assert.equal(first.rows.projectionVersion, second.rows.projectionVersion);
	assert.notEqual(first.rows.metadata.id, second.rows.metadata.id);
	assert.ok(second.rows.participants.every(({ roflMetadataId }) => roflMetadataId === second.rows.metadata.id));
	assert.ok(second.rows.participantData.every(({ roflMetadataId }) => roflMetadataId === second.rows.metadata.id));
	first.rows.participantData[0].loadout.itemIds[0] = 99;
	assert.equal(second.rows.participantData[0].loadout.itemIds[0], null);
});
