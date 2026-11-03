import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { gameMmrApplications, gameParticipants, matches, mmrLedgerEntries, mmrSeasons, scrims } from '../src/lib/server/db/schema.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { getGuildRecords, getPlayerRecords } from '../src/lib/server/records/queries.ts';
import { summarize } from '../src/lib/features/players/stats.ts';
import { createRecordsFixture } from './helpers/records.ts';

const champion = (id: string) => ({ id, name: id, iconUrl: null });

test('전적은 공개이며 당시 사용자·포지션과 채택 완료 Game만 사용한다', { skip: !process.env.DATABASE_URL }, async () => {
	const f = await createRecordsFixture();
	try {
		const records = await getGuildRecords(f.db, null, f.guildId, champion);
		assert.equal(records.recordedGames.length, 2);
		assert.equal(records.players.length, 10);
		assert.equal(records.allGames.length, 20);
		assert.deepEqual(records.recordedGames.map((game) => game.kills), [18, null]);
		const profile = await getPlayerRecords(f.db, null, f.guildId, f.userId, champion);
		assert.equal(profile.games.length, 2);
		assert.deepEqual(profile.player.riotIds, []);
		assert.deepEqual(profile.mmr, [
			{ position: 'top', rating: 1516, games: 0 }, { position: 'jungle', rating: 1500, games: 0 },
			{ position: 'mid', rating: 1500, games: 0 }, { position: 'bot', rating: 1500, games: 0 }, { position: 'support', rating: 1500, games: 0 }
		]);
		assert.equal(profile.games[0]?.playedAt, '2026-01-01T00:00:00.000Z');
		assert.equal(profile.games[0]?.kills, 0);
		assert.equal(profile.games[0]?.teamKills, 8);
		assert.equal(profile.games[1]?.playedAt, null);
		assert.equal(profile.games[1]?.position, null);
		assert.equal(profile.games[1]?.kills, null);
		assert.equal(profile.games[1]?.teamKills, null);
		assert.equal(profile.games[1]?.champion.id, 'unknown');
		assert.equal(profile.games[0]?.teammates.length, 4);
		assert.ok(profile.games[0]?.teammates.every((mate) => mate.userId !== f.userId));
		assert.equal(summarize(profile.games)?.wins, 1);
		assert.equal(summarize(profile.games)?.winStreak, null);
		const currentOwner = await getPlayerRecords(f.db, null, f.guildId, f.otherUserId, champion);
		assert.equal(currentOwner.games.length, 2);
		assert.deepEqual(currentOwner.player.riotIds, ['이전 계정#KR1']);
		assert.equal(currentOwner.mmr.length, 5);
		assert.ok(currentOwner.mmr.every((rating) => rating.rating === 1500 && rating.games === 0));
		const elsewhere = await getPlayerRecords(f.db, null, f.otherGuildId, f.userId, champion);
		assert.equal(elsewhere.games.length, 0);
		assert.deepEqual(elsewhere.player.riotIds, ['이전 계정#KR1']);
		assert.deepEqual(elsewhere.mmr, []);
		await assert.rejects(getPlayerRecords(f.db, null, f.guildId, f.outsiderUserId, champion), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
		// 종료된 시즌의 전적을 현재 시즌 통계나 개인 전적에 섞지 않는다.
		await f.db.update(scrims).set({ mmrSeasonId: f.oldSeasonId }).where(eq(scrims.id, f.scrimId));
		assert.equal((await getGuildRecords(f.db, null, f.guildId, champion)).recordedGames.length, 0);
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).games.length, 0);
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).mmr[0]?.rating, 1516);
		await f.db.update(scrims).set({ mmrSeasonId: f.seasonId }).where(eq(scrims.id, f.scrimId));
		await f.db.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, f.matchId));
		assert.equal((await getGuildRecords(f.db, null, f.guildId, champion)).allGames.length, 0);
		await f.db.update(matches).set({ status: 'in_progress' }).where(eq(matches.id, f.matchId));
		await f.db.update(scrims).set({ status: 'cancelled' }).where(eq(scrims.id, f.scrimId));
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).games.length, 0);
		// 중도 종료 전 확정한 게임은 정상 전적으로 보존한다.
		await f.db.update(scrims).set({ status: 'ended_early' }).where(eq(scrims.id, f.scrimId));
		await f.db.update(matches).set({ status: 'ended_early' }).where(eq(matches.id, f.matchId));
		assert.equal((await getGuildRecords(f.db, null, f.guildId, champion)).recordedGames.length, 2);
		await f.db.update(scrims).set({ status: 'in_progress' }).where(eq(scrims.id, f.scrimId));
		await f.db.update(matches).set({ status: 'in_progress' }).where(eq(matches.id, f.matchId));
		await f.db.update(mmrSeasons).set({ endedAt: new Date() }).where(eq(mmrSeasons.id, f.seasonId));
		assert.equal((await getGuildRecords(f.db, null, f.guildId, champion)).recordedGames.length, 0);
		assert.deepEqual((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).mmr, []);
		await f.db.update(mmrSeasons).set({ endedAt: null }).where(eq(mmrSeasons.id, f.seasonId));
		const applications = await f.db.insert(gameMmrApplications).values(f.games.slice(0, 2).map((game) => ({ scrimId: f.scrimId, gameId: game.id, seasonId: f.seasonId, roflMetadataId: game.roflMetadataId!, revision: 1 }))).returning();
		await f.db.insert(mmrLedgerEntries).values(applications.map((application, index) => ({ seasonId: f.seasonId, ratingId: f.ratingId, revision: index + 1, kind: 'game_result' as const,
			applicationId: application.id, scrimId: f.scrimId, scrimParticipantId: f.participantId, beforeMmr: 1500, afterMmr: 1516 })));
		// 원장이 있어도 실제 포지션을 확인하지 못한 게임은 해당 포지션 경기 수에 넣지 않는다.
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).mmr[0]?.games, 1);
		await f.db.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, f.matchId));
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).mmr[0]?.games, 0);
		await f.db.update(matches).set({ status: 'ended_early' }).where(eq(matches.id, f.matchId));
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).mmr[0]?.games, 1);
		await f.db.delete(gameParticipants).where(and(eq(gameParticipants.gameId, f.games[0]!.id), eq(gameParticipants.scrimParticipantId, f.participantId)));
		// 실제 출전 행이 없는 원장은 경기 수의 근거가 아니다.
		assert.equal((await getPlayerRecords(f.db, null, f.guildId, f.userId, champion)).mmr[0]?.games, 0);
	} finally { await f.close(); }
});
