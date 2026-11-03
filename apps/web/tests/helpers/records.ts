import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import * as schema from '../../src/lib/server/db/schema.ts';
import { ROFL_STAT_FIELDS } from '../../src/lib/server/rofl/projection.ts';

/** 읽기 서비스와 브라우저 검증이 같은 누락값·다중 서버 fixture를 사용한다. */
export async function createRecordsFixture() {
	const name = `msm2_records_test_${randomUUID().replaceAll('-', '')}`;
	const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
	await client.connect();
	let pool: Pool | undefined;
	const close = async () => {
		try { if (pool) await pool.end(); await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`); }
		finally { await client.end(); }
	};
	try {
		await client.query('BEGIN');
		await client.query(`CREATE SCHEMA "${name}"`);
		await client.query(`SET LOCAL search_path TO "${name}"`);
		const migration = await readFile(new URL('../../drizzle/0000_initial_schema.sql', import.meta.url), 'utf8');
		await client.query(migration.replaceAll('"public".', `"${name}".`).replace(/\bpublic\./g, `"${name}".`));
		await client.query('COMMIT');
		pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${name}` });
		const db = drizzle({ client: pool, schema });
		const guildId = '810000000000000001', otherGuildId = '810000000000000002';
		const users = Array.from({ length: 11 }, (_, index) => ({ id: String(820000000000000000n + BigInt(index)), username: `사용자 ${index}` }));
		await db.insert(schema.users).values(users);
		await db.insert(schema.guilds).values([{ id: guildId, name: '공개 전적 검증' }, { id: otherGuildId, name: '다른 서버' }]);
		const [account] = await db.insert(schema.riotAccounts).values({ puuid: randomUUID(), gameName: '이전 계정', tagLine: 'KR1' }).returning();
		// 현재 연결을 다른 사용자에게 옮겨도 지난 게임의 소유자는 바뀌지 않는다.
		await db.insert(schema.guildRiotAccounts).values([{ guildId, userId: users[1]!.id, riotAccountId: account!.id }, { guildId: otherGuildId, userId: users[0]!.id, riotAccountId: account!.id }]);
		const [activeSeason, oldSeason] = await db.insert(schema.mmrSeasons).values([{ guildId, name: '진행 시즌' }, { guildId, name: '과거 시즌', startedAt: new Date('2025-01-01'), endedAt: new Date('2025-12-31') }]).returning();
		const ratings = await db.insert(schema.userPositionMmr).values([{ seasonId: activeSeason!.id, userId: users[0]!.id, position: 'top', mmr: 1516 }, { seasonId: oldSeason!.id, userId: users[0]!.id, position: 'top', mmr: 1800 }]).returning();
		const [scrim, otherScrim] = await db.insert(schema.scrims).values([{ guildId, mmrSeasonId: activeSeason!.id, title: '기록된 내전', status: 'in_progress', formationMethod: 'auction' }, { guildId: otherGuildId, title: '다른 서버 내전', status: 'in_progress', formationMethod: 'auction' }]).returning();
		const teams = await db.insert(schema.scrimTeams).values([scrim!, otherScrim!].flatMap((row) => [1, 2].map((ordinal) => ({ scrimId: row.id, ordinal, name: `${ordinal}팀` })))).returning();
		const matches = await db.insert(schema.matches).values([scrim!, otherScrim!].map((row) => ({ scrimId: row.id, teamAId: teams.find((team) => team.scrimId === row.id && team.ordinal === 1)!.id,
			teamBId: teams.find((team) => team.scrimId === row.id && team.ordinal === 2)!.id, bestOf: 5, isHardFearless: false }))).returning();
		const participants = await db.insert(schema.scrimParticipants).values(users.slice(0, 10).map((user, index) => ({ scrimId: scrim!.id, userId: user.id, displayName: `당시 이름 ${index}`, riotAccountId: index === 0 ? account!.id : null }))).returning();
		const metadata = await db.insert(schema.roflMetadata).values(Array.from({ length: 5 }, (_, index) => ({ fileSha256: String(index + 1).repeat(64), fileSizeBytes: 100, formatVersion: 2, gameVersion: '26.21', projectionVersion: 1 }))).returning();
		await db.insert(schema.roflGameDataV1).values(metadata.map((entry) => ({ roflMetadataId: entry.id, gameLengthMs: 1_200_000, resultStatus: 'consistent' as const, winnerReplayTeamId: 100, teams: [{ teamId: 100, win: true }, { teamId: 200, win: false }] })));
		const games = await db.insert(schema.games).values([
			{ scrimId: scrim!.id, matchId: matches[0]!.id, gameNumber: 1, blueTeamSlot: 'a', status: 'completed', winnerSide: 'blue', roflMetadataId: metadata[0]!.id, startedAt: new Date('2026-01-01T00:00:00Z') },
			{ scrimId: scrim!.id, matchId: matches[0]!.id, gameNumber: 2, blueTeamSlot: 'b', status: 'completed', winnerSide: 'red', roflMetadataId: metadata[1]!.id },
			{ scrimId: scrim!.id, matchId: matches[0]!.id, gameNumber: 3, blueTeamSlot: 'a', status: 'pending', roflMetadataId: metadata[2]!.id },
			{ scrimId: otherScrim!.id, matchId: matches[1]!.id, gameNumber: 1, blueTeamSlot: 'a', status: 'completed', winnerSide: 'blue', roflMetadataId: metadata[3]!.id }
		]).returning();
		const loadout: schema.RoflLoadoutV1 = { itemIds: [null, null, null, null, null, null, null], summonerSpellIds: [null, null], primaryRuneStyleId: null, secondaryRuneStyleId: null, runeIds: [null, null, null, null, null, null], statRuneIds: [null, null, null] };
		const lanes = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
		for (const [gameIndex, game] of games.slice(0, 3).entries()) {
			await db.insert(schema.roflParticipants).values(participants.map((_participant, index) => ({ roflMetadataId: game.roflMetadataId!, participantIndex: index })));
			await db.insert(schema.roflParticipantDataV1).values(participants.map((_participant, index) => ({ roflMetadataId: game.roflMetadataId!, participantIndex: index, champion: gameIndex === 1 ? null : 'Ahri',
				stats: Object.fromEntries(Object.keys(ROFL_STAT_FIELDS).map((key) => [key, gameIndex === 1 ? null : key === 'kills' && index === 0 ? 0 : 2])) as schema.RoflStatsV1, loadout })));
			await db.insert(schema.gameParticipants).values(participants.map((participant, index) => ({ scrimId: scrim!.id, gameId: game.id, scrimParticipantId: participant.id,
				riotAccountId: index === 0 ? account!.id : null, displayName: participant.displayName, side: index < 5 ? 'blue' as const : 'red' as const,
				position: gameIndex === 1 ? null : lanes[index % 5], roflMetadataId: game.roflMetadataId!, roflParticipantIndex: index })));
		}
		return { db, schemaName: name, guildId, otherGuildId, userId: users[0]!.id, otherUserId: users[1]!.id, outsiderUserId: users[10]!.id, scrimId: scrim!.id, matchId: matches[0]!.id,
			seasonId: activeSeason!.id, oldSeasonId: oldSeason!.id, ratingId: ratings[0]!.id, participantId: participants[0]!.id, games, close };
	} catch (error) { await client.query('ROLLBACK'); await close(); throw error; }
}
