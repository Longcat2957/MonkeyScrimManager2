import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { Client } from 'pg';

test('초기 스키마를 격리된 PostgreSQL 트랜잭션에 적용하고 업무 제약을 검증한다', async (t) => {
	const connectionString = process.env.DATABASE_URL?.trim();
	assert.ok(connectionString, 'DB 통합 테스트에는 DATABASE_URL이 필요합니다.');
	const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
	const schemaName = `msm2_test_${randomUUID().replaceAll('-', '')}`;
	const migrationDirectory = new URL('../drizzle/', import.meta.url);
	const migrationFiles = (await readdir(migrationDirectory)).filter((name) => /^\d+_initial_schema\.sql$/.test(name));
	assert.equal(migrationFiles.length, 1, '초기 생성 SQL이 정확히 하나 있어야 합니다.');
	const migration = await readFile(new URL(migrationFiles[0]!, migrationDirectory), 'utf8');
	const guildId = randomUUID();
	let transactionStarted = false;

	// 예상한 제약 위반만 복구해 이후 검증과 마지막 전체 롤백을 계속할 수 있게 한다.
	async function rejectsSql(query: string, values: unknown[], code: string, constraint?: string) {
		await client.query('SAVEPOINT expected_failure');
		try {
			await assert.rejects(client.query(query, values), constraint ? { code, constraint } : { code });
		} finally {
			await client.query('ROLLBACK TO SAVEPOINT expected_failure');
			await client.query('RELEASE SAVEPOINT expected_failure');
		}
	}

	async function insertId(query: string, values: unknown[] = []): Promise<string> {
		const result = await client.query<{ id: string }>(query, values);
		return result.rows[0]!.id;
	}

	const createScrim = () => insertId(
		'INSERT INTO scrims (guild_id, title) VALUES ($1, $2) RETURNING id', [guildId, '제약 검증 내전']
	);
	const createTeam = (scrimId: string, ordinal: number, isActive = true) => insertId(
		'INSERT INTO scrim_teams (scrim_id, name, ordinal, is_active) VALUES ($1, $2, $3, $4) RETURNING id',
		[scrimId, `팀 ${ordinal}`, ordinal, isActive]
	);
	const createParticipant = (scrimId: string) => insertId(
		'INSERT INTO scrim_participants (scrim_id, display_name) VALUES ($1, $2) RETURNING id', [scrimId, '참가자']
	);
	const createAuction = (scrimId: string) => insertId(
		'INSERT INTO auctions (scrim_id) VALUES ($1) RETURNING id', [scrimId]
	);
	async function createMatch() {
		const scrimId = await createScrim();
		const teamAId = await createTeam(scrimId, 1);
		const teamBId = await createTeam(scrimId, 2);
		return insertId(
			'INSERT INTO matches (scrim_id, team_a_id, team_b_id, best_of, is_hard_fearless) VALUES ($1, $2, $3, 1, false) RETURNING id',
			[scrimId, teamAId, teamBId]
		);
	}

	try {
		// 연결 실패에 접속 문자열이나 드라이버의 내부 설정을 출력하지 않는다.
		try {
			await client.connect();
		} catch {
			throw new Error('DB 통합 테스트용 PostgreSQL 연결에 실패했습니다.');
		}
		await client.query('BEGIN');
		transactionStarted = true;
		// 이름은 UUID에서만 만들며 모든 DDL과 fixture를 이 임시 스키마에 한정한다.
		await client.query(`CREATE SCHEMA "${schemaName}"`);
		await client.query(`SET LOCAL search_path TO "${schemaName}"`);
		const schema = await client.query<{ current_schema: string }>('SELECT current_schema()');
		assert.equal(schema.rows[0]!.current_schema, schemaName);
		await client.query(migration.replaceAll('"public".', `"${schemaName}".`).replace(/\bpublic\./g, `"${schemaName}".`));
		await client.query('INSERT INTO guilds (id, name) VALUES ($1, $2)', [guildId, '통합 테스트 서버']);

		await t.test('세션은 해시·만료를 검증하고 사용자 삭제 시 함께 폐기한다', async () => {
			const userId = randomUUID();
			await client.query('INSERT INTO users (id, username) VALUES ($1, $2)', [userId, 'session-user']);
			const insert = 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)';
			const createdAt = '2026-01-01T00:00:00Z';
			const expiresAt = '2026-01-02T00:00:00Z';
			await client.query(insert, ['a'.repeat(64), userId, createdAt, expiresAt]);
			await rejectsSql(insert, ['A'.repeat(64), userId, createdAt, expiresAt], '23514', 'sessions_token_hash_format');
			await rejectsSql(insert, ['b'.repeat(63), userId, createdAt, expiresAt], '23514', 'sessions_token_hash_format');
			await rejectsSql(insert, ['b'.repeat(64), userId, createdAt, createdAt], '23514', 'sessions_expiry_order');
			await rejectsSql(insert, ['c'.repeat(64), userId, expiresAt, createdAt], '23514', 'sessions_expiry_order');
			await rejectsSql(insert, ['a'.repeat(64), userId, createdAt, expiresAt], '23505', 'sessions_pkey');
			await client.query('DELETE FROM users WHERE id = $1', [userId]);
			assert.equal((await client.query('SELECT token_hash FROM sessions WHERE user_id = $1', [userId])).rowCount, 0);
		});

		await t.test('내전 정원·revision·제목은 허용 경계 안에서만 저장한다', async () => {
			const scrimId = await createScrim();
			for (const [teamCount, reserveCapacity] of [[2, 0], [4, 10]]) {
				await client.query('UPDATE scrims SET team_count = $1, reserve_capacity = $2, revision = 1 WHERE id = $3', [teamCount, reserveCapacity, scrimId]);
			}
			for (const value of [1, 5]) {
				await rejectsSql('UPDATE scrims SET team_count = $1 WHERE id = $2', [value, scrimId], '23514', 'scrims_team_count_range');
			}
			for (const value of [-1, 11]) {
				await rejectsSql('UPDATE scrims SET reserve_capacity = $1 WHERE id = $2', [value, scrimId], '23514', 'scrims_reserve_capacity_range');
			}
			await rejectsSql('UPDATE scrims SET revision = -1 WHERE id = $1', [scrimId], '23514', 'scrims_revision_nonnegative');
			await client.query('UPDATE scrims SET title = $1 WHERE id = $2', ['가'.repeat(50), scrimId]);
			for (const value of ['   ', '가'.repeat(51)]) {
				await rejectsSql('UPDATE scrims SET title = $1 WHERE id = $2', [value, scrimId], '23514', 'scrims_title_length');
			}
		});

		await t.test('생성 요청은 실행자별로 고유하며 실행자 삭제 후 대진 확정 시각을 보존한다', async () => {
			const actorId = randomUUID();
			const otherActorId = randomUUID();
			const requestId = randomUUID();
			await client.query('INSERT INTO users (id, username) VALUES ($1, $2), ($3, $4)', [actorId, 'actor', otherActorId, 'other-actor']);
			const insert = 'INSERT INTO scrims (guild_id, title, created_by_user_id, creation_request_id) VALUES ($1, $2, $3, $4) RETURNING id';
			const scrimId = await insertId(insert, [guildId, '요청 내전', actorId, requestId]);
			await rejectsSql(insert, [guildId, '재시도 내전', actorId, requestId], '23505', 'scrims_creation_request_unique');
			await client.query(insert, [guildId, '다른 실행자 내전', otherActorId, requestId]);
			await rejectsSql('UPDATE scrims SET bracket_confirmed_by_user_id = $1 WHERE id = $2', [actorId, scrimId], '23514', 'scrims_bracket_confirmer_requires_time');
			await client.query('UPDATE scrims SET bracket_confirmed_by_user_id = $1, bracket_confirmed_at = $2 WHERE id = $3', [actorId, '2026-01-01T00:00:00Z', scrimId]);
			await client.query('DELETE FROM users WHERE id = $1', [actorId]);
			const result = await client.query('SELECT created_by_user_id, bracket_confirmed_by_user_id, bracket_confirmed_at FROM scrims WHERE id = $1', [scrimId]);
			assert.equal(result.rows[0].created_by_user_id, null);
			assert.equal(result.rows[0].bracket_confirmed_by_user_id, null);
			assert.equal(result.rows[0].bracket_confirmed_at.toISOString(), '2026-01-01T00:00:00.000Z');
		});

		await t.test('활성 팀 순서는 중복되지 않으며 비활성 팀 이력을 보존한다', async () => {
			const scrimId = await createScrim();
			const activeId = await createTeam(scrimId, 1);
			const inactiveId = await createTeam(scrimId, 1, false);
			await rejectsSql('INSERT INTO scrim_teams (scrim_id, name, ordinal) VALUES ($1, $2, 1)', [scrimId, '중복 팀'], '23505', 'scrim_teams_active_ordinal_unique');
			await rejectsSql('UPDATE scrim_teams SET is_active = true WHERE id = $1', [inactiveId], '23505', 'scrim_teams_active_ordinal_unique');
			await client.query('UPDATE scrim_teams SET is_active = false WHERE id = $1', [activeId]);
			await client.query('UPDATE scrim_teams SET is_active = true WHERE id = $1', [inactiveId]);
			for (const ordinal of [0, 5]) {
				await rejectsSql('UPDATE scrim_teams SET ordinal = $1 WHERE id = $2', [ordinal, inactiveId], '23514', 'scrim_teams_ordinal_range');
			}
			assert.equal((await client.query('SELECT id FROM scrim_teams WHERE scrim_id = $1', [scrimId])).rowCount, 2);
		});

		await t.test('경매 팀장은 일부만 지정할 수 있으며 중복 팀장·0점 예산은 거절한다', async () => {
			const scrimId = await createScrim();
			const auctionId = await createAuction(scrimId);
			const teamA = await createTeam(scrimId, 1);
			const teamB = await createTeam(scrimId, 2);
			const participantId = await createParticipant(scrimId);
			for (const teamId of [teamA, teamB]) {
				await client.query('INSERT INTO auction_teams (scrim_id, auction_id, team_id, initial_points) VALUES ($1, $2, $3, 1)', [scrimId, auctionId, teamId]);
			}
			await client.query('UPDATE auction_teams SET captain_participant_id = $1 WHERE team_id = $2', [participantId, teamA]);
			await rejectsSql('UPDATE auction_teams SET captain_participant_id = $1 WHERE team_id = $2', [participantId, teamB], '23505', 'auction_teams_captain_unique');
			await rejectsSql('UPDATE auction_teams SET initial_points = 0 WHERE team_id = $1', [teamB], '23514', 'auction_teams_initial_points_positive');
			await client.query('UPDATE auction_teams SET initial_points = 2147483647 WHERE team_id = $1', [teamB]);
			await rejectsSql('UPDATE auction_teams SET initial_points = $1 WHERE team_id = $2', [2147483648, teamB], '22003');
		});

		await t.test('경매 대기열은 다른 내전 후보·경매와 중복 순서를 거절한다', async () => {
			const scrimId = await createScrim();
			const otherScrimId = await createScrim();
			const auctionId = await createAuction(scrimId);
			const otherAuctionId = await createAuction(otherScrimId);
			const participantId = await createParticipant(scrimId);
			const nextParticipantId = await createParticipant(scrimId);
			const otherParticipantId = await createParticipant(otherScrimId);
			const insert = 'INSERT INTO auction_queue_entries (scrim_id, auction_id, scrim_participant_id, ordinal) VALUES ($1, $2, $3, $4)';
			await client.query(insert, [scrimId, auctionId, participantId, 1]);
			await rejectsSql(insert, [scrimId, auctionId, otherParticipantId, 2], '23503', 'auction_queue_entries_participant_fk');
			await rejectsSql(insert, [scrimId, otherAuctionId, nextParticipantId, 2], '23503', 'auction_queue_entries_auction_fk');
			await rejectsSql(insert, [scrimId, auctionId, nextParticipantId, 1], '23505', 'auction_queue_entries_ordinal_unique');
			await rejectsSql(insert, [scrimId, auctionId, nextParticipantId, 0], '23514', 'auction_queue_entries_ordinal_positive');
			await client.query(insert, [scrimId, auctionId, nextParticipantId, 2]);
			const result = await client.query('SELECT scrim_participant_id FROM auction_queue_entries WHERE auction_id = $1 ORDER BY ordinal', [auctionId]);
			assert.deepEqual(result.rows.map((row) => row.scrim_participant_id), [participantId, nextParticipantId]);
		});

		await t.test('경매 후보는 하나만 열고 종료·사유를 갖춘 시도만 무효화한다', async () => {
			const scrimId = await createScrim();
			const auctionId = await createAuction(scrimId);
			const participantId = await createParticipant(scrimId);
			const insert = 'INSERT INTO auction_lots (scrim_id, auction_id, scrim_participant_id, sequence_number, opened_at) VALUES ($1, $2, $3, $4, $5) RETURNING id';
			const openedAt = '2026-01-01T00:00:00Z';
			const closedAt = '2026-01-01T00:01:00Z';
			const lotId = await insertId(insert, [scrimId, auctionId, participantId, 1, openedAt]);
			await rejectsSql(insert, [scrimId, auctionId, participantId, 2, openedAt], '23505', 'auction_lots_open_auction_unique');
			await rejectsSql('UPDATE auction_lots SET voided_at = $1, void_reason = $2 WHERE id = $3', [closedAt, '되돌리기', lotId], '23514', 'auction_lots_void_details');
			await rejectsSql("UPDATE auction_lots SET status = 'unsold' WHERE id = $1", [lotId], '23514', 'auction_lots_closed_at_matches_status');
			await client.query("UPDATE auction_lots SET status = 'unsold', closed_at = $1 WHERE id = $2", [closedAt, lotId]);
			for (const reason of [null, '   ']) {
				await rejectsSql('UPDATE auction_lots SET voided_at = $1, void_reason = $2 WHERE id = $3', [closedAt, reason, lotId], '23514', 'auction_lots_void_details');
			}
			await rejectsSql('UPDATE auction_lots SET voided_at = $1, void_reason = $2 WHERE id = $3', [openedAt, '되돌리기', lotId], '23514', 'auction_lots_void_time');
			await client.query('UPDATE auction_lots SET voided_at = $1, void_reason = $2 WHERE id = $3', [closedAt, '되돌리기', lotId]);
			await client.query(insert, [scrimId, auctionId, participantId, 2, closedAt]);
			assert.equal((await client.query('SELECT id FROM auction_lots WHERE auction_id = $1', [auctionId])).rowCount, 2);
		});

		await t.test('라운드와 Match는 BO 1·3·5만 허용한다', async () => {
			const scrimId = await createScrim();
			const roundId = await insertId('INSERT INTO scrim_rounds (scrim_id, round_number, label, best_of) VALUES ($1, 1, $2, 1) RETURNING id', [scrimId, '결승']);
			const matchId = await createMatch();
			for (const bestOf of [1, 3, 5]) {
				await client.query('UPDATE scrim_rounds SET best_of = $1 WHERE id = $2', [bestOf, roundId]);
				await client.query('UPDATE matches SET best_of = $1 WHERE id = $2', [bestOf, matchId]);
			}
			for (const bestOf of [0, 2, 7]) {
				await rejectsSql('UPDATE scrim_rounds SET best_of = $1 WHERE id = $2', [bestOf, roundId], '23514', 'scrim_rounds_best_of_allowed');
				await rejectsSql('UPDATE matches SET best_of = $1 WHERE id = $2', [bestOf, matchId], '23514', 'matches_best_of_allowed');
			}
		});

		await t.test('직접 시드는 같은 내전의 다른 대진에도 중복 배치할 수 없다', async () => {
			const scrimId = await createScrim();
			const teamId = await createTeam(scrimId, 1);
			const roundId = await insertId('INSERT INTO scrim_rounds (scrim_id, round_number, label, best_of) VALUES ($1, 1, $2, 1) RETURNING id', [scrimId, '준결승']);
			const nodeA = await insertId('INSERT INTO scrim_bracket_nodes (scrim_id, round_id, match_number) VALUES ($1, $2, 1) RETURNING id', [scrimId, roundId]);
			const nodeB = await insertId('INSERT INTO scrim_bracket_nodes (scrim_id, round_id, match_number) VALUES ($1, $2, 2) RETURNING id', [scrimId, roundId]);
			const insert = 'INSERT INTO scrim_bracket_slots (scrim_id, node_id, slot, team_id) VALUES ($1, $2, $3, $4)';
			await client.query(insert, [scrimId, nodeA, 'a', teamId]);
			await rejectsSql(insert, [scrimId, nodeB, 'a', teamId], '23505', 'scrim_bracket_slots_team_unique');
			await client.query(insert, [scrimId, nodeA, 'b', null]);
			await client.query(insert, [scrimId, nodeB, 'a', null]);
			await client.query('INSERT INTO scrim_bracket_slots (scrim_id, node_id, slot, source_node_id) VALUES ($1, $2, $3, $4)', [scrimId, nodeB, 'b', nodeA]);
		});

		await t.test('중도 종료 복원 근거는 변경한 Match 상태와 일치하고 null 우회를 막는다', async () => {
			const matchId = await createMatch();
			for (const column of ['ended_at_before_scrim_end', 'end_reason_before_scrim_end']) {
				const value = column === 'ended_at_before_scrim_end' ? '2026-01-01T00:00:00Z' : '기존 사유';
				await rejectsSql(`UPDATE matches SET ${column} = $1 WHERE id = $2`, [value, matchId], '23514', 'matches_scrim_end_restore_state');
			}
			await rejectsSql("UPDATE matches SET status_before_scrim_end = 'pending' WHERE id = $1", [matchId], '23514', 'matches_scrim_end_restore_state');
			await client.query("UPDATE matches SET status = 'cancelled', status_before_scrim_end = 'pending' WHERE id = $1", [matchId]);
			await rejectsSql("UPDATE matches SET status_before_scrim_end = 'in_progress' WHERE id = $1", [matchId], '23514', 'matches_scrim_end_restore_state');
			await client.query("UPDATE matches SET status = 'ended_early', status_before_scrim_end = 'in_progress', end_reason_before_scrim_end = $1 WHERE id = $2", ['기존 사유', matchId]);
			await rejectsSql("UPDATE matches SET status_before_scrim_end = 'completed' WHERE id = $1", [matchId], '23514', 'matches_scrim_end_restore_state');
			await client.query("UPDATE matches SET status = 'in_progress', status_before_scrim_end = null, ended_at_before_scrim_end = null, end_reason_before_scrim_end = null WHERE id = $1", [matchId]);
		});

		await t.test('참가자는 활성 신청 하나만 가지며 철회 후 새 신청 이력을 남긴다', async () => {
			const participantId = await createParticipant(await createScrim());
			const insert = 'INSERT INTO scrim_participant_registrations (scrim_participant_id, status, joined_at) VALUES ($1, $2, $3) RETURNING id';
			const joinedAt = '2026-01-01T00:00:00Z';
			const registrationId = await insertId(insert, [participantId, 'selected', joinedAt]);
			await rejectsSql(insert, [participantId, 'standby', joinedAt], '23505', 'scrim_participant_registrations_active_unique');
			await rejectsSql("UPDATE scrim_participant_registrations SET status = 'withdrawn' WHERE id = $1", [registrationId], '23514', 'scrim_participant_registrations_status_closure');
			await client.query("UPDATE scrim_participant_registrations SET status = 'withdrawn', withdrawn_at = $1 WHERE id = $2", ['2026-01-01T00:01:00Z', registrationId]);
			await client.query(insert, [participantId, 'selected', '2026-01-01T00:02:00Z']);
			assert.equal((await client.query('SELECT id FROM scrim_participant_registrations WHERE scrim_participant_id = $1', [participantId])).rowCount, 2);
		});

		await t.test('포지션은 팀 배정이 필요하고 경매의 포지션 미정 팀원은 허용한다', async () => {
			const scrimId = await createScrim();
			const teamId = await createTeam(scrimId, 1);
			const participantA = await createParticipant(scrimId);
			const participantB = await createParticipant(scrimId);
			await rejectsSql("UPDATE scrim_participants SET position = 'top' WHERE id = $1", [participantA], '23514', 'scrim_participants_position_requires_team');
			await client.query('UPDATE scrim_participants SET team_id = $1 WHERE id = ANY($2::uuid[])', [teamId, [participantA, participantB]]);
			await client.query("UPDATE scrim_participants SET position = 'top' WHERE id = $1", [participantA]);
			await rejectsSql("UPDATE scrim_participants SET position = 'top' WHERE id = $1", [participantB], '23505', 'scrim_participants_team_position_unique');
		});
	} finally {
		// 실패한 검증이 있어도 스키마·fixture를 통째로 되돌려 영구 업무 데이터를 남기지 않는다.
		try {
			if (transactionStarted) await client.query('ROLLBACK');
		} finally {
			await client.end();
		}
	}
});
