import assert from 'node:assert/strict';
import test from 'node:test';
import sample from '../src/lib/mocks/fixtures/rofl-sample.json' with { type: 'json' };
import { getMockMatch, listMockMatches, recordMockGame, type GameResolvers, type RawGame } from '../src/lib/mocks/matches.ts';

const guildId = 'devGuild001';
const resolvers: GameResolvers = {
	champion: (id) => ({ id, name: id, iconUrl: null }),
	item: (id) => (id ? { id, name: String(id), iconUrl: null } : null),
	spell: (id) => (id ? { id, name: String(id), iconUrl: null } : null),
	rune: (id) => (id ? { id, name: String(id), iconUrl: null } : null),
	splash: () => null
};

test('검색·상태 필터·쪽 나눔으로 경기를 고른다', async () => {
	const all = await listMockMatches(guildId, { status: 'all', q: '', page: 1, pageSize: 20 });
	assert.equal(all.matches.length, 20);
	assert.equal(all.counts.all, all.counts.in_progress + all.counts.done);
	const searched = await listMockMatches(guildId, { status: 'all', q: '칼바람', page: 1, pageSize: 20 });
	assert.deepEqual(searched.matches.map((match) => match.id), ['devMatch001']);
	const live = await listMockMatches(guildId, { status: 'in_progress', q: '', page: 1, pageSize: 20 });
	assert.ok(live.matches.every((match) => match.status === 'in_progress'));
});

test('게임 결과에서 진영·MVP·ACE·피어리스 위반을 만든다', async () => {
	const detail = (await getMockMatch(guildId, 'devMatch003', 'devMatch003-g1', resolvers))!;
	assert.deepEqual([detail.match.scoreA, detail.match.scoreB], [1, 2]);
	const game = detail.game!;
	assert.deepEqual(game.sides.map((side) => side.side), ['blue', 'red']);
	assert.equal(game.sides.flatMap((side) => side.players).filter((player) => player.badge === 'mvp').length, 1);
	assert.equal(game.sides.find((side) => side.win)!.players.some((player) => player.badge === 'mvp'), true);
	assert.ok(game.sides.flatMap((side) => side.players).every((player) => !player.fearlessViolation));
	assert.equal((await getMockMatch(guildId, 'devMatch003', 'unknown', resolvers))!.game!.order, 3);
});

test('업로드한 게임을 기록하고 같은 파일·종료된 경기는 거절한다', async () => {
	const raw = { ...(sample as RawGame), gameLengthMs: 1_234_567 };
	assert.deepEqual(await recordMockGame(guildId, 'devMatch001', raw), { order: 3 });
	assert.equal(((await recordMockGame(guildId, 'devMatch001', raw)) as { status: number }).status, 409);
	const detail = (await getMockMatch(guildId, 'devMatch001', null, resolvers))!;
	assert.equal(detail.match.status, 'completed');
	assert.equal(detail.can.upload, false);
	assert.equal(((await recordMockGame(guildId, 'devMatch002', raw)) as { status: number }).status, 409);
});
