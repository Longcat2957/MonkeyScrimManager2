import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createRoflImportDraft, type RoflImportContext } from '../src/lib/server/rofl/import-model.ts';

function fixture() {
	const players = [
		{ RIOT_ID_GAME_NAME: 'Example', RIOT_ID_TAG_LINE: '0012', PUUID: 'opaque-replay-value', TEAM: '100', WIN: 'Win', SKIN: 'Ahri' },
		{ TEAM: '200', WIN: 'Fail', SKIN: 'Ashe' }
	];
	const version = Buffer.from('16.21.829.8620');
	const header = Buffer.alloc(15 + version.length);
	header.write('RIOT'); header.writeUInt16LE(2, 4); header[14] = version.length; version.copy(header, 15);
	const metadata = Buffer.from(JSON.stringify({ gameLength: 120_000, statsJson: JSON.stringify(players) }));
	const length = Buffer.alloc(4); length.writeUInt32LE(metadata.length);
	return { bytes: Buffer.concat([header, Buffer.alloc(256), metadata, length]), metadata };
}

function context(): RoflImportContext {
	return {
		guildId: 'guild-1', scrimId: 'scrim-1', matchId: 'match-1', gameId: 'game-2', gameNumber: 2,
		uploadedByUserId: 'uploader-1', uploadedAt: new Date('2026-10-28T12:00:00Z'),
		replayStorageKey: 'replays/original.rofl', metadataStorageKey: 'replays/metadata.raw.json'
	};
}

test('import draft fingerprints source bytes and keeps service identity separate from replay identity', () => {
	const { bytes, metadata } = fixture();
	const before = Buffer.from(bytes);
	const input = context();
	input.teams = [{ replayTeamId: 100, teamId: 'service-team-b' }, { replayTeamId: 200, teamId: 'service-team-a' }];
	input.participants = [{ participantIndex: 0, playerId: 'guild-player-7', riotAccountId: 'account-3' }];
	const draft = createRoflImportDraft(bytes, input);
	assert.equal(draft.status, 'pending_review');
	assert.deepEqual(draft.registration, { guildId: 'guild-1', scrimId: 'scrim-1', matchId: 'match-1', gameId: 'game-2', gameNumber: 2 });
	assert.deepEqual(draft.source, {
		replayStorageKey: input.replayStorageKey, replaySha256: createHash('sha256').update(bytes).digest('hex'), replayBytes: bytes.length,
		metadataStorageKey: input.metadataStorageKey, metadataSha256: createHash('sha256').update(metadata).digest('hex'), metadataBytes: metadata.length
	});
	assert.deepEqual(draft.upload, { uploadedByUserId: 'uploader-1', uploadedAt: '2026-10-28T12:00:00.000Z' });
	assert.deepEqual(draft.links.teams, [{ replayTeamId: 100, teamId: 'service-team-b' }, { replayTeamId: 200, teamId: 'service-team-a' }]);
	assert.deepEqual(draft.links.participants, [
		{ participantIndex: 0, playerId: 'guild-player-7', riotAccountId: 'account-3' },
		{ participantIndex: 1, playerId: null, riotAccountId: null }
	]);
	assert.equal(draft.game.participants[0].replayPuuid, 'opaque-replay-value');
	assert.equal(draft.game.participants[0].riotId.tagLine, '0012');
	assert.equal(draft.game.result.status, 'consistent');
	assert.equal(Object.hasOwn(draft.game, 'playedAt'), false);
	assert.equal(Object.hasOwn(draft.game, 'metadata'), false);
	assert.deepEqual(bytes, before);
	// The draft owns its binding values instead of retaining mutable caller objects.
	input.participants[0].playerId = 'changed';
	input.uploadedAt.setFullYear(2000);
	assert.equal(draft.links.participants[0].playerId, 'guild-player-7');
	assert.equal(draft.upload.uploadedAt, '2026-10-28T12:00:00.000Z');
});

test('unprovided service links stay null even when the replay has an identity and a consistent winner', () => {
	const { bytes } = fixture();
	const draft = createRoflImportDraft(bytes, context());
	assert.equal(draft.status, 'pending_review');
	assert.ok(draft.links.teams.every(({ teamId }) => teamId === null));
	assert.ok(draft.links.participants.every(({ playerId, riotAccountId }) => playerId === null && riotAccountId === null));
	assert.equal(draft.game.result.winnerTeamId, 100);
});

test('links must address an existing replay participant or team exactly once', () => {
	const { bytes } = fixture();
	for (const change of [
		{ teams: [{ replayTeamId: 300, teamId: 'team-x' }] },
		{ teams: [{ replayTeamId: 100, teamId: 'a' }, { replayTeamId: 100, teamId: 'b' }] },
		{ participants: [{ participantIndex: 2, playerId: 'p', riotAccountId: null }] },
		{ participants: [{ participantIndex: 0.5, playerId: 'p', riotAccountId: null }] },
		{ participants: [{ participantIndex: 0, playerId: 'p', riotAccountId: null }, { participantIndex: 0, playerId: 'q', riotAccountId: null }] },
		{ participants: [{ participantIndex: 0, playerId: ' ', riotAccountId: null }] }
	]) {
		assert.throws(() => createRoflImportDraft(bytes, { ...context(), ...change }), { code: 'INVALID_IMPORT_CONTEXT' });
	}
});

test('invalid service context cannot become a plausible registration or timestamp', () => {
	const { bytes } = fixture();
	for (const change of [
		{ guildId: '' }, { gameId: '  ' }, { uploadedByUserId: '' }, { replayStorageKey: '' },
		{ gameNumber: 0 }, { gameNumber: 1.5 }, { gameNumber: Number.MAX_SAFE_INTEGER + 1 },
		{ uploadedAt: new Date('invalid') }
	]) {
		assert.throws(() => createRoflImportDraft(bytes, { ...context(), ...change }), { code: 'INVALID_IMPORT_CONTEXT' });
	}
});
