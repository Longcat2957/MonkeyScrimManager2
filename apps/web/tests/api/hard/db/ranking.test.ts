import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { queryRankingPage } from '../../../../src/lib/server/guild/ranking-queries.ts';
import { createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1);
	const application = await f.apply(game.id);
	const ranking = (offset = 0, limit = 10) => queryRankingPage(f.db, null, f.guildId, 'top', { offset, limit, userId: f.users[5]!.id, championIcon: (id) => `${id}.png` });
	return { ...f, game, application, ranking };
}

test('순위는 현재 시즌 실적만 세고 페이지 밖 본인 순위를 별도로 반환한다', async (t) => {
	const f = await fixture(t);
	const result = await f.ranking(0, 1);
	assert.equal(result?.seasonName, '현재 시즌');
	assert.equal(result?.page.entries[0]?.userId, f.manager.userId);
	assert.equal(result?.page.entries[0]?.mmr, 1516);
	assert.equal(result?.page.entries[0]?.games, 1);
	assert.equal(result?.page.entries[0]?.wins, 1);
	assert.equal(result?.page.entries[0]?.iconUrl, 'Ahri.png');
	assert.equal(result?.page.hasMore, true);
	assert.equal(result?.page.me?.rank, 2);
	assert.equal(result?.page.me?.isMe, true);
	assert.equal(result?.page.me?.wins, 0);
	assert.equal((await f.ranking(1, 1))?.page.hasMore, false);
	assert.equal(await queryRankingPage(f.db, null, f.otherGuildId, 'top', { offset: 0, limit: 10, userId: null }), null);
});

test('탈퇴한 멤버와 기록 없는 초기 점수는 순위와 본인 순위에서 제외한다', async (t) => {
	const f = await fixture(t);
	await f.db.insert(schema.userPositionMmr).values({ seasonId: f.season.id, userId: f.users[11]!.id, position: 'top', mmr: 1500 });
	await f.db.delete(schema.guildMembers).where(and(eq(schema.guildMembers.guildId, f.guildId), eq(schema.guildMembers.userId, f.users[5]!.id)));
	const result = await f.ranking();
	assert.deepEqual(result?.page.entries.map((entry) => entry.userId), [f.manager.userId]);
	assert.equal(result?.page.me, null);
});

for (const parent of ['scrim', 'match'] as const) test(`취소 ${parent}은 순위에서 제외하고 중도 종료의 완료 Game은 유지한다`, async (t) => {
	const f = await fixture(t);
	const table = parent === 'scrim' ? schema.scrims : schema.matches;
	const id = parent === 'scrim' ? f.scrimId : f.match.id;
	await f.db.update(table).set({ status: 'cancelled' }).where(eq(table.id, id));
	assert.deepEqual((await f.ranking())?.page.entries, []);
	await f.db.update(table).set({ status: 'ended_early' }).where(eq(table.id, id));
	assert.equal((await f.ranking())?.page.entries.length, 2);
});

test('역분개한 Game은 남아 있는 원장·점수와 무관하게 순위 실적에서 제외한다', async (t) => {
	const f = await fixture(t);
	await f.reverse(f.game.id, f.application.applicationId);
	assert.deepEqual((await f.ranking())?.page.entries, []);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
});

for (const mismatch of ['missingPosition', 'missingParticipant', 'adoptedReplay', 'pendingGame'] as const) test(`${mismatch} 불일치 자료를 순위 실적으로 집계하지 않는다`, async (t) => {
	const f = await fixture(t);
	// 정상 반영 후 조회 방어를 확인하기 위한 의도적 불일치 자료다.
	const target = and(eq(schema.gameParticipants.gameId, f.game.id), eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id));
	if (mismatch === 'missingPosition') await f.db.update(schema.gameParticipants).set({ position: null }).where(target);
	if (mismatch === 'missingParticipant') await f.db.delete(schema.gameParticipants).where(target);
	if (mismatch === 'pendingGame') await f.db.update(schema.games).set({ status: 'pending', winnerSide: null }).where(eq(schema.games.id, f.game.id));
	if (mismatch === 'adoptedReplay') {
		const [replacement] = await f.db.insert(schema.roflMetadata).values({ fileSha256: randomBytes(32).toString('hex'), fileSizeBytes: 100, formatVersion: 2, gameVersion: '26.21', projectionVersion: 1 }).returning();
		await f.db.delete(schema.gameParticipants).where(eq(schema.gameParticipants.gameId, f.game.id));
		await f.db.update(schema.games).set({ roflMetadataId: replacement!.id }).where(eq(schema.games.id, f.game.id));
	}
	assert.ok(!(await f.ranking())?.page.entries.some((entry) => entry.userId === f.manager.userId));
});

test('대표 챔피언 동률은 식별자 순서로 정하고 소수 점수를 반올림하지 않는다', async (t) => {
	const f = await fixture(t);
	const next = await f.createGame(f.db, 2, f.match.id, 'a', { champion: 'Aatrox' });
	await f.apply(next.id);
	const result = await f.ranking();
	assert.equal(result?.page.entries[0]?.iconUrl, 'Aatrox.png');
	assert.equal(result?.page.entries[0]?.games, 2);
	assert.ok(!Number.isInteger(result!.page.entries[0]!.mmr));
	assert.equal(result?.page.entries[0]?.mmr, (await f.ratings())[0]!.mmr);
});

test('활성 시즌 종료와 잘못된 페이지 범위를 구분한다', async (t) => {
	const f = await fixture(t);
	await assert.rejects(f.ranking(-1), errorCode('INVALID_INPUT'));
	await assert.rejects(f.ranking(0, 101), errorCode('INVALID_INPUT'));
	await assert.rejects(queryRankingPage(f.db, null, f.guildId, 'invalid' as 'top', { offset: 0, limit: 10, userId: null }), errorCode('INVALID_INPUT'));
	await f.db.update(schema.mmrSeasons).set({ endedAt: new Date('2026-11-03T12:00:00Z') }).where(eq(schema.mmrSeasons.id, f.season.id));
	assert.equal(await f.ranking(), null);
});
