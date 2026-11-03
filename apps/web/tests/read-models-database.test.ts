import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import * as schema from '../src/lib/server/db/schema.ts';
import type { Actor } from '../src/lib/server/auth/types.ts';
import type { GameResolvers } from '../src/lib/features/matches/types.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { assertGuildView, requireGuildView } from '../src/lib/server/guild/access.ts';
import { getMatch, listMatches } from '../src/lib/server/matches/queries.ts';
import { queryRankingPage } from '../src/lib/server/guild/ranking-queries.ts';

const enabled = Boolean(process.env.DATABASE_URL?.trim());
const errorCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;
const icon = (id: number | null) => id === null ? null : { id, name: `아이콘 ${id}`, iconUrl: null };
const resolvers: GameResolvers = { champion: (id) => ({ id, name: id, iconUrl: null }), item: icon, spell: icon, rune: icon, splash: () => null };

test('공개 경기·순위 조회는 길드·채택 ROFL·실출전·유효 원장 경계를 지킨다', { skip: !enabled }, async (t) => {
	const connectionString = process.env.DATABASE_URL;
	const schemaName = `msm2_read_test_${randomUUID().replaceAll('-', '')}`;
	const directory = new URL('../drizzle/', import.meta.url);
	const files = (await readdir(directory)).filter((name) => /^\d+_initial_schema\.sql$/.test(name));
	assert.equal(files.length, 1);
	const migration = await readFile(new URL(files[0]!, directory), 'utf8');
	const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
	await client.connect();
	let pool: Pool | undefined;
	try {
		await client.query('BEGIN');
		await client.query(`CREATE SCHEMA "${schemaName}"`);
		await client.query(`SET LOCAL search_path TO "${schemaName}"`);
		await client.query(migration.replaceAll('"public".', `"${schemaName}".`).replace(/\bpublic\./g, `"${schemaName}".`));
		await client.query('COMMIT');
		pool = new Pool({ connectionString, max: 2, options: `-c search_path=${schemaName}` });
		const db = drizzle({ client: pool, schema });
		const guildId = '920000000000000001';
		const otherGuildId = '920000000000000002';
		const inactiveGuildId = '920000000000000003';
		const userIds = ['920000000000000011', '920000000000000012', '920000000000000013', '920000000000000014'];
		const actor = (index: number): Actor => ({ userId: userIds[index]!, isServiceAdmin: index === 3 });
		await db.insert(schema.users).values(userIds.map((id, index) => ({ id, username: `현재 이름 ${index}` })));
		await db.insert(schema.guilds).values([{ id: guildId, name: '공개 서버', isActive: true }, { id: otherGuildId, name: '다른 공개 서버', isActive: true }, { id: inactiveGuildId, name: '비활성 서버', isActive: false }]);
		const operatorRoleId = '920000000000000099';
		await db.insert(schema.guildDiscordSettings).values({ guildId, operatorRoleId });
		await db.insert(schema.guildMembers).values([
			{ guildId, userId: userIds[0]!, manageGuild: true, roleIds: [], syncedAt: new Date() },
			{ guildId, userId: userIds[1]!, manageGuild: false, roleIds: [operatorRoleId], syncedAt: new Date() },
			{ guildId, userId: userIds[2]!, manageGuild: true, isAdmin: true, roleIds: [], syncedAt: new Date(Date.now() - 120_000) }
		]);
		await t.test('비로그인·비멤버도 공개 열람하고 운영 힌트는 최신 길드 권한으로만 결정한다', async () => {
			assert.equal((await requireGuildView(null, guildId, { db })).isAdmin, false);
			assert.equal((await assertGuildView(db, actor(0), guildId)).isAdmin, true);
			assert.equal((await assertGuildView(db, actor(1), guildId)).isAdmin, true);
			assert.equal((await assertGuildView(db, actor(2), guildId)).isAdmin, false);
			assert.equal((await assertGuildView(db, actor(3), guildId)).isAdmin, false);
			assert.equal((await assertGuildView(db, actor(0), otherGuildId)).isAdmin, false);
			await assert.rejects(assertGuildView(db, null, inactiveGuildId), errorCode('NOT_FOUND'));
			await assert.rejects(assertGuildView(db, null, 'not-a-guild'), errorCode('NOT_FOUND'));
			await db.update(schema.guildDiscordSettings).set({ operatorRoleId: guildId }).where(eq(schema.guildDiscordSettings.guildId, guildId));
			assert.equal((await assertGuildView(db, actor(1), guildId)).isAdmin, false);
			await db.update(schema.guildDiscordSettings).set({ operatorRoleId }).where(eq(schema.guildDiscordSettings.guildId, guildId));
		});
		const [season] = await db.insert(schema.mmrSeasons).values({ guildId, name: '현재 시즌' }).returning();
		const [otherSeason] = await db.insert(schema.mmrSeasons).values({ guildId: otherGuildId, name: '다른 시즌' }).returning();
		const [scrim] = await db.insert(schema.scrims).values({ guildId, title: '100%_내전', mmrSeasonId: season!.id, formationMethod: 'manual', status: 'in_progress' }).returning();
		const [otherScrim] = await db.insert(schema.scrims).values({ guildId: otherGuildId, title: '숨겨진 다른 내전', mmrSeasonId: otherSeason!.id }).returning();
		const teams = await db.insert(schema.scrimTeams).values([{ scrimId: scrim!.id, ordinal: 1, name: '과거 A팀', isActive: false }, { scrimId: scrim!.id, ordinal: 2, name: '과거 B팀', isActive: false }]).returning();
		const otherTeams = await db.insert(schema.scrimTeams).values([{ scrimId: otherScrim!.id, ordinal: 1, name: '다른 A팀' }, { scrimId: otherScrim!.id, ordinal: 2, name: '다른 B팀' }]).returning();
		const [match] = await db.insert(schema.matches).values({ scrimId: scrim!.id, teamAId: teams[0]!.id, teamBId: teams[1]!.id, bestOf: 3, isHardFearless: true, status: 'in_progress' }).returning();
		const [extraMatch] = await db.insert(schema.matches).values({ scrimId: scrim!.id, teamAId: teams[0]!.id, teamBId: teams[1]!.id, bestOf: 5, isHardFearless: false, status: 'cancelled' }).returning();
		const [otherMatch] = await db.insert(schema.matches).values({ scrimId: otherScrim!.id, teamAId: otherTeams[0]!.id, teamBId: otherTeams[1]!.id, bestOf: 1, isHardFearless: false }).returning();
		const participants = await db.insert(schema.scrimParticipants).values(userIds.slice(0, 2).map((userId, index) => ({ scrimId: scrim!.id, userId, displayName: `현재 참가 이름 ${index}` }))).returning();
		const loadout: schema.RoflLoadoutV1 = { itemIds: [0, 1001, null, null, null, null, null], summonerSpellIds: [4, null], primaryRuneStyleId: null, secondaryRuneStyleId: null, runeIds: [null, null, null, null, null, null], statRuneIds: [null, null, null] };
		const stats = { kills: 0, deaths: 0, assists: 2, minionsKilled: 0, neutralMinionsKilled: 0, level: 11 } as schema.RoflStatsV1;
		const metadata = async () => (await db.insert(schema.roflMetadata).values({ fileSha256: randomUUID().replaceAll('-', '').repeat(2), fileSizeBytes: 100, formatVersion: 3, gameVersion: '16.1.1', projectionVersion: 1 }).returning())[0]!;
		const replay1 = await metadata();
		const replay2 = await metadata();
		for (const [index, replay] of [replay1, replay2].entries()) {
			await db.insert(schema.roflGameDataV1).values({ roflMetadataId: replay.id, gameLengthMs: index === 0 ? 1_200_000 : 0, resultStatus: 'consistent', winnerReplayTeamId: index === 0 ? 200 : 100, teams: [{ teamId: 100, win: index !== 0 }, { teamId: 200, win: index === 0 }] });
			await db.insert(schema.roflParticipants).values([0, 1].map((participantIndex) => ({ roflMetadataId: replay.id, participantIndex })));
			await db.insert(schema.roflParticipantDataV1).values([0, 1].map((participantIndex) => ({ roflMetadataId: replay.id, participantIndex, champion: participantIndex === 0 ? 'Garen' : 'Ahri', stats, loadout })));
		}
		const [firstGame] = await db.insert(schema.games).values({ scrimId: scrim!.id, matchId: match!.id, gameNumber: 1, blueTeamSlot: 'b', status: 'completed', winnerSide: 'red', roflMetadataId: replay1.id, startedAt: new Date('2026-10-01T10:00:00Z') }).returning();
		const [secondGame] = await db.insert(schema.games).values({ scrimId: scrim!.id, matchId: match!.id, gameNumber: 2, blueTeamSlot: 'a', status: 'completed', winnerSide: 'blue', roflMetadataId: replay2.id }).returning();
		for (const [index, game] of [firstGame!, secondGame!].entries()) await db.insert(schema.gameParticipants).values(participants.map((participant, memberIndex) => ({ scrimId: scrim!.id, gameId: game.id, scrimParticipantId: participant.id,
			displayName: `경기 당시 이름 ${memberIndex}`, riotGameName: memberIndex === 0 ? 'Snapshot' : null, riotTagLine: memberIndex === 0 ? 'KR1' : null,
			side: (index === memberIndex ? 'red' : 'blue') as 'red' | 'blue', position: 'mid' as const, roflMetadataId: game.roflMetadataId!, roflParticipantIndex: memberIndex })));
		const [ratingA, ratingB] = await db.insert(schema.userPositionMmr).values([{ seasonId: season!.id, userId: userIds[0], position: 'mid', mmr: 1550.5 }, { seasonId: season!.id, userId: userIds[1], position: 'mid', mmr: 1490.25 }]).returning();
		await db.insert(schema.userPositionMmr).values({ seasonId: season!.id, userId: userIds[2], position: 'mid', mmr: 9999 });
		await db.insert(schema.userPositionMmr).values({ seasonId: otherSeason!.id, userId: userIds[0], position: 'mid', mmr: 9999 });
		let revision = 0;
		const application = async (game: typeof schema.games.$inferSelect, replayId: string, reversed: boolean, withBoth = false) => {
			const [app] = await db.insert(schema.gameMmrApplications).values({ scrimId: scrim!.id, gameId: game.id, seasonId: season!.id, roflMetadataId: replayId, revision: 1,
				appliedAt: new Date('2026-10-01T11:00:00Z'), ...(reversed ? { reversedAt: new Date('2026-10-02T11:00:00Z'), reversalReason: '검증용 역분개' } : {}) }).returning();
			revision += 1;
			await db.insert(schema.mmrLedgerEntries).values((withBoth ? [ratingA!, ratingB!] : [ratingA!]).map((rating, index) => ({ seasonId: season!.id, ratingId: rating.id, revision, kind: 'game_result' as const,
				applicationId: app!.id, scrimId: scrim!.id, scrimParticipantId: participants[index]!.id, beforeMmr: 1500, afterMmr: rating.mmr })));
			return app!;
		};
		await application(firstGame!, replay1.id, false, true);
		await application(secondGame!, replay2.id, true);
		const staleReplay = await metadata();
		const adoptedReplay = await metadata();
		const [staleGame] = await db.insert(schema.games).values({ scrimId: scrim!.id, matchId: extraMatch!.id, gameNumber: 1, blueTeamSlot: 'a', status: 'completed', winnerSide: 'red', roflMetadataId: adoptedReplay.id }).returning();
		await application(staleGame!, staleReplay.id, false);
		const emptyReplay = await metadata();
		const [emptyGame] = await db.insert(schema.games).values({ scrimId: scrim!.id, matchId: extraMatch!.id, gameNumber: 2, blueTeamSlot: 'a', status: 'completed', winnerSide: 'blue', roflMetadataId: emptyReplay.id }).returning();
		await application(emptyGame!, emptyReplay.id, false);
		const pendingReplay = await metadata();
		const [pendingGame] = await db.insert(schema.games).values({ scrimId: scrim!.id, matchId: extraMatch!.id, gameNumber: 3, blueTeamSlot: 'a', roflMetadataId: pendingReplay.id }).returning();
		await application(pendingGame!, pendingReplay.id, false);
		await t.test('목록은 공개지만 다른 서버 경기를 섞지 않고 검색 특수문자·실제 시각을 보존한다', async () => {
			const list = await listMatches(db, null, guildId, { status: 'all', page: 1, pageSize: 20 });
			assert.equal(list.total, 2);
			assert.ok(list.matches.every((item) => item.id !== otherMatch!.id));
			assert.equal(list.matches.find((item) => item.id === match!.id)?.scoreA, 2);
			assert.equal(list.matches.find((item) => item.id === match!.id)?.playedAt, '2026-10-01T10:00:00.000Z');
			assert.equal(list.matches.find((item) => item.id === extraMatch!.id)?.playedAt, null);
			assert.equal((await listMatches(db, null, guildId, { status: 'in_progress', q: '%_', page: 1, pageSize: 20 })).total, 1);
			assert.equal((await listMatches(db, null, guildId, { status: 'done', page: 1, pageSize: 20 })).total, 1);
			assert.equal(await getMatch(db, null, guildId, otherMatch!.id, null, resolvers), null);
		});
		await t.test('채택 Game의 당시 이름·진영·실제 0과 누락 null을 구분하고 피어리스를 팀에 귀속한다', async () => {
			const detail = await getMatch(db, null, guildId, match!.id, secondGame!.id, resolvers);
			assert.ok(detail?.game);
			assert.equal(detail.match.scoreA, 2);
			assert.equal(detail.game.durationSec, 0);
			assert.equal(detail.game.playedAt, null);
			assert.equal(detail.game.mmrStatus, 'pending');
			const player = detail.game.sides.find((side) => side.slot === 'a')!.players[0]!;
			assert.equal(player.displayName, '경기 당시 이름 0');
			assert.equal(player.riotId, 'Snapshot#KR1');
			assert.equal(player.kills, 0);
			assert.equal(player.cs, 0);
			assert.equal(player.damage, null);
			assert.equal(player.score, null);
			assert.equal(player.items[0]?.id, 0);
			assert.equal(player.items[2], null);
			assert.equal(player.fearlessViolation, true);
			assert.equal(detail.can.upload, false);
			assert.deepEqual(detail.usedChampions?.a.map((champion) => champion.id), ['Garen']);
			assert.equal((await getMatch(db, null, guildId, match!.id, firstGame!.id, resolvers))?.game?.mmrStatus, 'applied');
			const unprojected = await getMatch(db, null, guildId, extraMatch!.id, staleGame!.id, resolvers);
			assert.equal(unprojected?.game?.durationSec, null);
			assert.equal(unprojected?.game?.mmrStatus, 'pending');
			assert.ok(unprojected?.game?.sides.every((side) => side.players.length === 0));
		});
		await t.test('순위 경기 수·승률에는 채택본·완료 Game·실출전·유효 반영이 모두 맞는 원장만 센다', async () => {
			// 부모 취소 여부와 무관하게 채택본 불일치·실출전 누락·미완료·역분개를 각각 제외한다.
			await db.update(schema.matches).set({ status: 'in_progress' }).where(eq(schema.matches.id, extraMatch!.id));
			const result = await queryRankingPage(db, null, guildId, 'mid', { offset: 0, limit: 1, userId: userIds[1]!, championIcon: (id) => `${id}.png` });
			assert.ok(result);
			assert.equal(result.seasonName, '현재 시즌');
			assert.equal(result.page.entries[0]?.mmr, 1550.5);
			assert.equal(result.page.entries[0]?.games, 1);
			assert.equal(result.page.entries[0]?.wins, 1);
			assert.equal(result.page.entries[0]?.iconUrl, 'Garen.png');
			assert.equal(result.page.hasMore, true);
			assert.equal(result.page.me?.rank, 2);
			assert.equal(result.page.me?.games, 1);
			assert.equal(result.page.me?.wins, 0);
			assert.equal(result.page.me?.iconUrl, 'Ahri.png');
			assert.equal((await queryRankingPage(db, null, guildId, 'mid', { offset: 1, limit: 1, userId: null }))?.page.hasMore, false);
			assert.deepEqual((await queryRankingPage(db, null, otherGuildId, 'mid', { offset: 0, limit: 10, userId: null }))?.page.entries, []);
			await db.update(schema.matches).set({ status: 'cancelled' }).where(eq(schema.matches.id, extraMatch!.id));
			await assert.rejects(queryRankingPage(db, null, guildId, 'invalid' as 'mid', { offset: 0, limit: 10, userId: null }), errorCode('INVALID_INPUT'));
		});
		await t.test('순위는 현재 멤버와 유효 1경기 이상만 포함하고 취소를 제외하며 중도 종료를 보존한다', async () => {
			const ranking = () => queryRankingPage(db, null, guildId, 'mid', { offset: 0, limit: 10, userId: userIds[1]! });
			assert.deepEqual((await ranking())?.page.entries.map((entry) => entry.userId), userIds.slice(0, 2));
			await db.delete(schema.guildMembers).where(and(eq(schema.guildMembers.guildId, guildId), eq(schema.guildMembers.userId, userIds[1]!)));
			const formerMember = await ranking();
			assert.deepEqual(formerMember?.page.entries.map((entry) => entry.userId), [userIds[0]]);
			assert.equal(formerMember?.page.me, null);
			await db.insert(schema.guildMembers).values({ guildId, userId: userIds[1]! });
			await db.update(schema.matches).set({ status: 'cancelled' }).where(eq(schema.matches.id, match!.id));
			assert.deepEqual((await ranking())?.page.entries, []);
			await db.update(schema.matches).set({ status: 'in_progress' }).where(eq(schema.matches.id, match!.id));
			await db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, scrim!.id));
			assert.deepEqual((await ranking())?.page.entries, []);
			await db.update(schema.matches).set({ status: 'ended_early' }).where(eq(schema.matches.id, match!.id));
			await db.update(schema.scrims).set({ status: 'ended_early' }).where(eq(schema.scrims.id, scrim!.id));
			assert.equal((await ranking())?.page.entries.length, 2);
			await db.update(schema.mmrSeasons).set({ endedAt: new Date() }).where(eq(schema.mmrSeasons.id, season!.id));
			assert.equal(await ranking(), null);
			await db.update(schema.mmrSeasons).set({ endedAt: null }).where(eq(schema.mmrSeasons.id, season!.id));
		});
		await t.test('대표 챔피언은 해당 시즌·포지션의 취소되지 않은 기록에서 사용 수와 식별자 순으로 정한다', async () => {
			await db.update(schema.roflParticipantDataV1).set({ champion: 'Ahri' }).where(and(eq(schema.roflParticipantDataV1.roflMetadataId, replay2.id), eq(schema.roflParticipantDataV1.participantIndex, 0)));
			await db.insert(schema.roflGameDataV1).values({ roflMetadataId: adoptedReplay.id, gameLengthMs: 1_200_000, resultStatus: 'consistent', winnerReplayTeamId: 200,
				teams: [{ teamId: 100, win: false }, { teamId: 200, win: true }] });
			await db.insert(schema.roflParticipants).values({ roflMetadataId: adoptedReplay.id, participantIndex: 0 });
			await db.insert(schema.roflParticipantDataV1).values({ roflMetadataId: adoptedReplay.id, participantIndex: 0, champion: 'Aatrox', stats, loadout });
			await db.insert(schema.gameParticipants).values({ scrimId: scrim!.id, gameId: staleGame!.id, scrimParticipantId: participants[0]!.id,
				displayName: '취소 경기 출전자', side: 'red', position: 'mid', roflMetadataId: adoptedReplay.id, roflParticipantIndex: 0 });
			const ranking = await queryRankingPage(db, null, guildId, 'mid', { offset: 0, limit: 10, userId: null, championIcon: (id) => `${id}.png` });
			assert.equal(ranking?.page.entries[0]?.iconUrl, 'Ahri.png');
			assert.equal(ranking?.page.entries[0]?.games, 1);
		});
	} finally {
		await pool?.end();
		await client.query('ROLLBACK');
		await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
		await client.end();
	}
});
