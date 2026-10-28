import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ROFL_METADATA_BYTES, parseRoflMetadata } from '../src/lib/server/rofl/parser.ts';

// Synthetic container only: the opaque payload and signature are not genuine game data.
const player = {
	RIOT_ID_GAME_NAME: '테스트 참가자', RIOT_ID_TAG_LINE: 'KR1', PUUID: 'replay-native-id',
	SKIN: 'Ahri', TEAM: '100', WIN: 'Win', CHAMPIONS_KILLED: '3', NUM_DEATHS: '2',
	ASSISTS: '7', MINIONS_KILLED: '120', NEUTRAL_MINIONS_KILLED: '8'
};

function metadata(players: unknown = [player]): Record<string, unknown> {
	return { gameLength: 1_895_012, lastGameChunkId: 65, lastKeyFrameId: 32, statsJson: JSON.stringify(players) };
}

function replay(value: unknown = metadata(), version = '16.5.752.7101', rawMetadata?: Uint8Array): Buffer {
	const versionBytes = Buffer.from(version, 'ascii');
	const header = Buffer.alloc(15 + versionBytes.length);
	header.write('RIOT', 0, 'ascii');
	header.writeUInt16LE(2, 4);
	header[14] = versionBytes.length;
	versionBytes.copy(header, 15);
	const json = rawMetadata === undefined ? Buffer.from(JSON.stringify(value), 'utf8') : Buffer.from(rawMetadata);
	const footer = Buffer.alloc(4);
	footer.writeUInt32LE(json.length);
	return Buffer.concat([header, Buffer.alloc(32, 0x42), Buffer.alloc(256, 0x7f), json, footer]);
}

test('ROFL2 metadata preserves raw fields and extracts Korean identities and final match stats', () => {
	const rawPlayer = { ...player, FUTURE_STAT: { values: [1, 2] } };
	const rawMetadata: Record<string, unknown> = { ...metadata([rawPlayer]), futureMetadata: { enabled: true } };
	const bytes = replay(rawMetadata);
	const before = Buffer.from(bytes);
	// A view into a larger allocation must behave like an isolated file.
	const padded = Buffer.concat([Buffer.alloc(9), bytes, Buffer.alloc(11)]);
	const result = parseRoflMetadata(padded.subarray(9, 9 + bytes.length));
	assert.equal(result.formatVersion, 2);
	assert.equal(result.gameVersion, '16.5.752.7101');
	assert.equal(result.gameLengthMs, 1_895_012);
	assert.deepEqual(result.metadata, rawMetadata);
	assert.equal(result.metadata.statsJson, rawMetadata.statsJson);
	assert.deepEqual(result.participants, [{
		index: 0,
		riotId: { gameName: '테스트 참가자', tagLine: 'KR1' },
		replayPuuid: 'replay-native-id', champion: 'Ahri', teamId: 100, win: true,
		kills: 3, deaths: 2, assists: 7, minionsKilled: 120, neutralMinionsKilled: 8, creepScore: 128
	}]);
	assert.deepEqual(bytes, before);
});

test('missing values remain null while explicit zeros stay zero and CS requires both counters', () => {
	const partial = { RIOT_ID_GAME_NAME: '', TEAM: '200', WIN: 'Fail', CHAMPIONS_KILLED: 0, NUM_DEATHS: '0', ASSISTS: null, MINIONS_KILLED: '0' };
	const unknown = { WIN: 'Unknown result', NEUTRAL_MINIONS_KILLED: '', ASSISTS: '' };
	const [first, second] = parseRoflMetadata(replay(metadata([partial, unknown]))).participants;
	assert.equal(first.teamId, 200);
	assert.equal(first.win, false);
	assert.equal(first.kills, 0);
	assert.equal(first.deaths, 0);
	assert.equal(first.assists, null);
	assert.equal(first.minionsKilled, 0);
	assert.equal(first.neutralMinionsKilled, null);
	assert.equal(first.creepScore, null);
	assert.deepEqual(first.riotId, { gameName: null, tagLine: null });
	assert.equal(first.replayPuuid, null);
	assert.equal(first.champion, null);
	assert.equal(second.teamId, null);
	assert.equal(second.win, null);
	assert.equal(second.assists, null);
	assert.equal(second.neutralMinionsKilled, null);
	assert.equal(second.creepScore, null);
	const [zero] = parseRoflMetadata(replay(metadata([{ MINIONS_KILLED: '0', NEUTRAL_MINIONS_KILLED: 0 }]))).participants;
	assert.equal(zero.creepScore, 0);
});

test('participant count and order do not imply a ten-player game or determine a team', () => {
	const players = Array.from({ length: 20 }, (_, index) => ({
		...player, RIOT_ID_GAME_NAME: `참가자${index}`, TEAM: index % 2 ? '100' : '200', WIN: index % 2 ? 'Win' : 'Fail'
	}));
	const result = parseRoflMetadata(replay(metadata(players)));
	assert.equal(result.participants.length, 20);
	assert.deepEqual(result.participants.map((entry) => entry.index), Array.from({ length: 20 }, (_, index) => index));
	assert.deepEqual(result.participants.map((entry) => entry.teamId), players.map((entry) => Number(entry.TEAM)));
	assert.deepEqual(result.participants.map((entry) => entry.win), players.map((entry) => entry.WIN === 'Win'));
});

test('invalid magic, truncated headers and unsupported format versions produce classified errors', () => {
	const wrongMagic = replay();
	wrongMagic.write('FAKE', 0, 'ascii');
	for (const bytes of [Buffer.alloc(0), replay().subarray(0, 5), wrongMagic, replay(metadata(), 'not-a-game-version')]) {
		assert.throws(() => parseRoflMetadata(bytes), { code: 'INVALID_FILE' });
	}
	for (const version of [0, 1, 3, 65535]) {
		const bytes = replay();
		bytes.writeUInt16LE(version, 4);
		assert.throws(() => parseRoflMetadata(bytes), { code: 'UNSUPPORTED_FORMAT' });
	}
});

test('metadata bounds must leave room for the header and signature and obey the allocation limit', () => {
	const outsideFile = replay();
	outsideFile.writeUInt32LE(outsideFile.length + 1, outsideFile.length - 4);
	assert.throws(() => parseRoflMetadata(outsideFile), { code: 'INVALID_FILE' });
	const overlap = replay();
	// The JSON starts inside the signature/header boundary even though the length is below the limit.
	overlap.writeUInt32LE(overlap.length - 4 - 256 - 10, overlap.length - 4);
	assert.throws(() => parseRoflMetadata(overlap), { code: 'INVALID_FILE' });
	const oversized = replay();
	oversized.writeUInt32LE(MAX_ROFL_METADATA_BYTES + 1, oversized.length - 4);
	assert.throws(() => parseRoflMetadata(oversized), { code: 'METADATA_TOO_LARGE' });
});

test('invalid UTF-8 and malformed outer or nested JSON are rejected without permissive decoding', () => {
	for (const raw of [Buffer.from([0xc3, 0x28]), Buffer.from('{'), Buffer.from('null'), Buffer.from('[]')]) {
		assert.throws(() => parseRoflMetadata(replay(undefined, undefined, raw)), { code: 'INVALID_METADATA' });
	}
	for (const statsJson of ['[', 'null', '{}', '[]', '[null]', '[1]', '[[]]']) {
		assert.throws(() => parseRoflMetadata(replay({ ...metadata(), statsJson })), { code: 'INVALID_METADATA' });
	}
	assert.throws(() => parseRoflMetadata(replay({ gameLength: 1000 })), { code: 'INVALID_METADATA' });
	assert.throws(() => parseRoflMetadata(replay({ ...metadata(), statsJson: [player] })), { code: 'INVALID_METADATA' });
});

test('invalid duration and present malformed participant fields never become plausible statistics', () => {
	for (const gameLength of [undefined, null, -1, 1.5, '1000', Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => parseRoflMetadata(replay({ ...metadata(), gameLength })), { code: 'INVALID_METADATA' });
	}
	for (const value of ['12oops', '-1', '1e2', '1.5', true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => parseRoflMetadata(replay(metadata([{ ...player, CHAMPIONS_KILLED: value }]))), { code: 'INVALID_METADATA' });
	}
	for (const change of [{ RIOT_ID_GAME_NAME: 3 }, { PUUID: {} }, { WIN: false }]) {
		assert.throws(() => parseRoflMetadata(replay(metadata([{ ...player, ...change }]))), { code: 'INVALID_METADATA' });
	}
});

test('unknown header and payload bytes are opaque and never become a trusted game identifier', () => {
	const bytes = replay();
	bytes.fill(0xab, 6, 14);
	const result = parseRoflMetadata(bytes);
	assert.equal(result.gameVersion, '16.5.752.7101');
	assert.equal(result.gameLengthMs, 1_895_012);
	assert.equal(Object.hasOwn(result, 'gameId'), false);
	assert.equal(Object.hasOwn(result, 'matchId'), false);
});
