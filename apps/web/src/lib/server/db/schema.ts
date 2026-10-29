import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	// Discord 사용자 ID를 그대로 사용하며, 정밀도 손실을 막기 위해 문자열로 저장한다.
	id: text('id').primaryKey(),
	username: text('username').notNull(),
	// Discord 전역 프로필이며, 서버별 닉네임이나 아바타와는 구분한다.
	globalName: text('global_name'),
	avatarHash: text('avatar_hash'),
	// 백오피스 접근을 위한 서비스 운영자 여부이며 길드별 관리자 권한과는 별도로 관리한다.
	isServiceAdmin: boolean('is_service_admin').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	// 자동 갱신은 Drizzle을 통한 수정에만 적용된다. 직접 SQL을 쓰면 명시적으로 갱신한다.
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date())
});

// 탑·정글·미드·바텀·서포터를 구분하며, 선호 챔피언은 사용자가 포지션별로 지정한다.
export const lolPosition = pgEnum('lol_position', ['top', 'jungle', 'mid', 'bot', 'support']);

export const userChampionPreferences = pgTable('user_champion_preferences', {
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	position: lolPosition('position').notNull(),
	// Data Dragon 챔피언의 key를 정수로 저장한다. 실제 존재 여부는 저장 시 카탈로그로 검증한다.
	championId: integer('champion_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
}, (table) => [
	// 같은 챔피언을 여러 포지션에 등록할 수 있지만 동일 포지션 내 중복은 허용하지 않는다.
	primaryKey({ columns: [table.userId, table.position, table.championId] }),
	check('user_champion_preferences_champion_id_positive', sql`${table.championId} > 0`)
]);

export const guilds = pgTable('guilds', {
	// Discord 서버 ID를 사용한다. 서버장이 서비스에 가입했는지는 길드 생성 조건이 아니다.
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	iconHash: text('icon_hash'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date())
});

// 현재 사용자와 길드의 연결 및 길드별 서비스 권한을 관리한다. 과거 경기 참가 이력과는 구분한다.
export const guildMembers = pgTable('guild_members', {
	guildId: text('guild_id').notNull().references(() => guilds.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	// 해당 길드의 서비스 관리자 여부이며 Discord 자체 권한과는 별도로 관리한다.
	isAdmin: boolean('is_admin').default(false).notNull(),
	// 서비스에 연결을 저장한 시각이며 Discord 서버 가입 시각과는 구분한다.
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
}, (table) => [
	primaryKey({ columns: [table.guildId, table.userId] }),
	index('guild_members_user_id_idx').on(table.userId)
]);

export const riotAccounts = pgTable('riot_accounts', {
	// 경기 등 서비스 내부 참조에는 이 ID를 사용하고, 외부 API 식별자는 별도로 보관한다.
	id: uuid('id').defaultRandom().primaryKey(),
	// Riot API가 반환한 PUUID만 저장한다. ROFL 원시 PUUID와 자동 연결하지 않는다.
	puuid: text('puuid').notNull().unique(),
	// 한 사용자에게 여러 계정을 연결할 수 있다. 사용자 삭제 시 계정은 보존하고 연결만 해제한다.
	userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
	// 변경 가능한 표시 정보이며 계정 식별에 사용하지 않는다. API 응답에서 생략될 수 있다.
	gameName: text('game_name'),
	tagLine: text('tag_line'),
	// LoL 활성 플랫폼이며 ACCOUNT-V1 지역 클러스터와는 구분한다. 미확인 상태는 null이다.
	platform: text('platform'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	// 직접 SQL이나 외래키의 SET NULL 동작에는 Drizzle의 자동 갱신이 적용되지 않는다.
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date())
}, (table) => [
	index('riot_accounts_user_id_idx').on(table.userId)
]);

// completed는 정상 종료, ended_early는 경기 시작 후 중도 종료, cancelled는 시작 전 취소다.
export const scrimStatus = pgEnum('scrim_status', [
	'recruit', 'preparing', 'ready', 'in_progress', 'completed', 'ended_early', 'cancelled'
]);

export const scrimFormationMethod = pgEnum('scrim_formation_method', ['manual', 'auction']);

// 모집부터 종료까지 같은 내전을 유지한다. 경기 시작 후 팀을 다시 편성하려면 새 내전을 모집한다.
// 상태 전환 조건과 시작 후 편성 변경 금지는 이후 서비스 로직에서 검사한다.
// 중도 종료 시 확정된 Game 결과와 Match 점수는 보존하며, 미완료 시리즈의 승자를 임의로 확정하지 않는다.
export const scrims = pgTable('scrims', {
	id: uuid('id').defaultRandom().primaryKey(),
	// 내전 기록이 남은 길드는 실수로 함께 삭제되지 않도록 제한한다.
	guildId: text('guild_id').notNull().references(() => guilds.id, { onDelete: 'restrict' }),
	// 웹·봇에서 생성을 요청한 사용자이며, 사용자 삭제 후에도 내전은 보존한다.
	createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	status: scrimStatus('status').default('recruit').notNull(),
	// 모집 중에는 미정일 수 있지만 팀 편성을 시작하기 전에는 방식을 결정한다.
	formationMethod: scrimFormationMethod('formation_method'),
	// 새 Match를 만들 때 사용할 기본값이다. 실제 적용값은 Match에 복사하며 이후 변경을 전파하지 않는다.
	isHardFearless: boolean('is_hard_fearless').default(false).notNull(),
	// 팀당 5명 기준으로 10인은 2팀, 20인은 4팀이다. 모집 정원은 팀 수에서 계산한다.
	teamCount: integer('team_count').default(2).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	// 직접 SQL이나 외래키의 SET NULL 동작에는 Drizzle의 자동 갱신이 적용되지 않는다.
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date())
}, (table) => [
	index('scrims_guild_id_idx').on(table.guildId),
	index('scrims_created_by_user_id_idx').on(table.createdByUserId),
	check('scrims_team_count_min', sql`${table.teamCount} >= 2`),
	check('scrims_formation_method_required', sql`${table.status} in ('recruit', 'cancelled') or ${table.formationMethod} is not null`)
]);

export const scrimTeams = pgTable('scrim_teams', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull().references(() => scrims.id, { onDelete: 'restrict' }),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	// 참가자와 대진에서 같은 내전의 팀만 연결할 수 있도록 복합 외래키의 대상이 된다.
	unique('scrim_teams_scrim_id_id_unique').on(table.scrimId, table.id)
]);

// 모집 참가 기록은 길드 탈퇴·사용자 삭제 후에도 보존한다. 경기 시작 후 팀 재편성은 허용하지 않는다.
export const scrimParticipants = pgTable('scrim_participants', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull().references(() => scrims.id, { onDelete: 'restrict' }),
	userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
	riotAccountId: uuid('riot_account_id').references(() => riotAccounts.id, { onDelete: 'restrict' }),
	// 참가 등록 당시 표시 이름이며, 현재 사용자 프로필에서 과거 이름을 다시 계산하지 않는다.
	displayName: text('display_name').notNull(),
	// 모집 중에는 팀·배정 포지션이 비어 있을 수 있다. 인원수와 편성 확정 조건은 서비스에서 검사한다.
	teamId: uuid('team_id'),
	position: lolPosition('position'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	unique('scrim_participants_scrim_id_id_unique').on(table.scrimId, table.id),
	unique('scrim_participants_user_unique').on(table.scrimId, table.userId),
	unique('scrim_participants_account_unique').on(table.scrimId, table.riotAccountId),
	unique('scrim_participants_team_position_unique').on(table.scrimId, table.teamId, table.position),
	foreignKey({
		name: 'scrim_participants_team_fk',
		columns: [table.scrimId, table.teamId], foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
	}).onDelete('restrict'),
	index('scrim_participants_user_id_idx').on(table.userId),
	index('scrim_participants_riot_account_id_idx').on(table.riotAccountId)
]);

export const matchStatus = pgEnum('match_status', ['pending', 'in_progress', 'completed', 'ended_early', 'cancelled']);
export const matchTeamSlot = pgEnum('match_team_slot', ['a', 'b']);
export const gameSide = pgEnum('game_side', ['blue', 'red']);
export const gameStatus = pgEnum('game_status', ['pending', 'in_progress', 'awaiting_result', 'completed', 'cancelled']);
export const replayResultStatus = pgEnum('replay_result_status', ['consistent', 'incomplete', 'conflicting']);

// V1의 저장 계약을 고정한다. 이후 파서 규약이 바뀌면 새 하위 모델을 추가하고 기존 V1은 유지한다.
export type RoflStatsV1 = Record<
	| 'kills' | 'deaths' | 'assists' | 'minionsKilled' | 'neutralMinionsKilled'
	| 'damageDealtToChampions' | 'damageTaken' | 'goldEarned'
	| 'visionScore' | 'wardsPlaced' | 'wardsKilled' | 'controlWardsBought' | 'level'
	| 'physicalDamageDealtToChampions' | 'magicDamageDealtToChampions' | 'trueDamageDealtToChampions'
	| 'physicalDamageTaken' | 'magicDamageTaken' | 'trueDamageTaken'
	| 'totalHeal' | 'healOnTeammates' | 'damageShieldedOnTeammates'
	| 'timeCcingOthers' | 'totalTimeCrowdControlDealt' | 'totalTimeCrowdControlDealtToChampions' | 'totalTimeSpentDead'
	| 'doubleKills' | 'tripleKills' | 'quadraKills' | 'pentaKills' | 'killingSprees' | 'largestKillingSpree' | 'largestMultiKill',
	number | null
>;

export interface RoflLoadoutV1 {
	itemIds: [number | null, number | null, number | null, number | null, number | null, number | null, number | null];
	summonerSpellIds: [number | null, number | null];
	primaryRuneStyleId: number | null;
	secondaryRuneStyleId: number | null;
	runeIds: [number | null, number | null, number | null, number | null, number | null, number | null];
	statRuneIds: [number | null, number | null, number | null];
}

// 업로드 입력에서 필요한 값만 추출한다. 원본 파일·전체 메타데이터·패킷 덤프·보관 경로는 저장하지 않는다.
// 공통 메타는 한 번의 파싱 결과를 식별하며, 실제 데이터는 projectionVersion에 맞는 하위 모델에 저장한다.
// 메타와 해당 버전의 모든 하위 데이터는 한 트랜잭션에서 저장하며, 채택한 결과는 덮어쓰지 않는다.
export const roflMetadata = pgTable('rofl_metadata', {
	id: uuid('id').defaultRandom().primaryKey(),
	// 해시와 크기는 중복 확인용 소형 메타이며 원본 파일을 다시 읽기 위한 참조가 아니다.
	fileSha256: text('file_sha256').notNull(),
	fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
	formatVersion: integer('format_version').notNull(),
	gameVersion: text('game_version').notNull(),
	// Riot의 포맷·게임 버전과 구분되는, 자체 선별 필드 및 검증 규약의 버전이다.
	projectionVersion: integer('projection_version').notNull(),
	uploadedByUserId: text('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	uploadedAt: timestamp('uploaded_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
}, (table) => [
	unique('rofl_metadata_file_projection_unique').on(table.fileSha256, table.projectionVersion),
	unique('rofl_metadata_id_projection_unique').on(table.id, table.projectionVersion),
	index('rofl_metadata_uploaded_by_user_id_idx').on(table.uploadedByUserId),
	check('rofl_metadata_sha256_format', sql`${table.fileSha256} ~ '^[0-9a-f]{64}$'`),
	check('rofl_metadata_size_safe_positive', sql`${table.fileSizeBytes} between 1 and 9007199254740991`),
	check('rofl_metadata_format_positive', sql`${table.formatVersion} > 0`),
	check('rofl_metadata_projection_positive', sql`${table.projectionVersion} > 0`)
]);

// 버전이 달라져도 운영 경기에서 참가자를 참조하는 키는 유지한다. 버전별 세부 데이터는 아래에 분리한다.
export const roflParticipants = pgTable('rofl_participants', {
	roflMetadataId: uuid('rofl_metadata_id').notNull().references(() => roflMetadata.id, { onDelete: 'restrict' }),
	participantIndex: integer('participant_index').notNull()
}, (table) => [
	primaryKey({ columns: [table.roflMetadataId, table.participantIndex] }),
	check('rofl_participants_index_nonnegative', sql`${table.participantIndex} >= 0`)
]);

export const roflGameDataV1 = pgTable('rofl_game_data_v1', {
	roflMetadataId: uuid('rofl_metadata_id').primaryKey(),
	projectionVersion: integer('projection_version').default(1).notNull(),
	gameLengthMs: bigint('game_length_ms', { mode: 'number' }).notNull(),
	// 이 상태는 메타데이터 일관성만 뜻한다. 경기 결과 승인이나 계정 소유권 증명이 아니다.
	resultStatus: replayResultStatus('result_status').notNull(),
	winnerReplayTeamId: bigint('winner_replay_team_id', { mode: 'number' }),
	// ROFL의 팀 번호와 승패만 저장하며 서비스의 팀 ID로 추정하지 않는다.
	teams: jsonb('teams').$type<{ teamId: number; win: boolean | null }[]>().notNull()
}, (table) => [
	foreignKey({
		name: 'rofl_game_data_v1_metadata_fk',
		columns: [table.roflMetadataId, table.projectionVersion], foreignColumns: [roflMetadata.id, roflMetadata.projectionVersion]
	}).onDelete('restrict'),
	check('rofl_game_data_v1_projection', sql`${table.projectionVersion} = 1`),
	check('rofl_game_data_v1_length_safe', sql`${table.gameLengthMs} between 0 and 9007199254740991`),
	check('rofl_game_data_v1_winner_safe', sql`${table.winnerReplayTeamId} between 0 and 9007199254740991`),
	check('rofl_game_data_v1_winner_consistency', sql`(${table.resultStatus} = 'consistent' and ${table.winnerReplayTeamId} is not null) or (${table.resultStatus} <> 'consistent' and ${table.winnerReplayTeamId} is null)`)
]);

export const roflParticipantDataV1 = pgTable('rofl_participant_data_v1', {
	roflMetadataId: uuid('rofl_metadata_id').notNull().references(() => roflGameDataV1.roflMetadataId, { onDelete: 'restrict' }),
	participantIndex: integer('participant_index').notNull(),
	gameName: text('game_name'),
	tagLine: text('tag_line'),
	// API PUUID·숫자 챔피언 ID·서비스 팀 ID와 구분되는 선별 원값이다.
	replayPuuid: text('replay_puuid'),
	champion: text('champion'),
	replayTeamId: bigint('replay_team_id', { mode: 'number' }),
	win: boolean('win'),
	// P0~P2 33개 통계와 최종 세팅만 저장한다. 누락값 null, 실제 0, 슬롯 순서를 그대로 유지한다.
	// CC·사망 시간의 단위는 미확정이다. JSONB 내용은 기존 projection 검증을 거쳐 저장한다.
	stats: jsonb('stats').$type<RoflStatsV1>().notNull(),
	loadout: jsonb('loadout').$type<RoflLoadoutV1>().notNull()
}, (table) => [
	primaryKey({ columns: [table.roflMetadataId, table.participantIndex] }),
	foreignKey({
		name: 'rofl_participant_data_v1_participant_fk',
		columns: [table.roflMetadataId, table.participantIndex], foreignColumns: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
	}).onDelete('restrict'),
	check('rofl_participant_data_v1_team_safe', sql`${table.replayTeamId} between 0 and 9007199254740991`)
]);

// Match는 두 팀의 시리즈다. 점수는 completed 상태인 Game에서 집계하며 별도로 중복 저장하지 않는다.
// Game 생성 후 A/B 팀 변경 금지와 경기 시작 후 bestOf·피어리스 변경 금지는 서비스에서 검사한다.
export const matches = pgTable('matches', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull().references(() => scrims.id, { onDelete: 'restrict' }),
	// A/B는 시리즈의 고정 팀 구분이다. 각 Game의 블루/레드 진영과는 별개다.
	teamAId: uuid('team_a_id').notNull(),
	teamBId: uuid('team_b_id').notNull(),
	label: text('label'),
	bestOf: integer('best_of').notNull(),
	// Scrim 기본값을 생성 시 명시적으로 저장한다. 사용한 픽은 이 Match 안에서 양 팀에 누적 적용한다.
	isHardFearless: boolean('is_hard_fearless').notNull(),
	status: matchStatus('status').default('pending').notNull(),
	// 정상 종료에만 시리즈 승자를 기록한다. 1:0·1:1 중도 종료에는 승자를 만들지 않는다.
	winnerTeamId: uuid('winner_team_id'),
	startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }),
	endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }),
	endReason: text('end_reason'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	unique('matches_scrim_id_id_unique').on(table.scrimId, table.id),
	foreignKey({
		name: 'matches_team_a_fk',
		columns: [table.scrimId, table.teamAId], foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'matches_team_b_fk',
		columns: [table.scrimId, table.teamBId], foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
	}).onDelete('restrict'),
	index('matches_team_a_id_idx').on(table.teamAId),
	index('matches_team_b_id_idx').on(table.teamBId),
	check('matches_distinct_teams', sql`${table.teamAId} <> ${table.teamBId}`),
	check('matches_best_of_positive_odd', sql`${table.bestOf} > 0 and ${table.bestOf} % 2 = 1`),
	check('matches_winner_is_competing_team', sql`${table.winnerTeamId} is null or ${table.winnerTeamId} in (${table.teamAId}, ${table.teamBId})`),
	check('matches_winner_requires_completion', sql`(${table.status} = 'completed' and ${table.winnerTeamId} is not null) or (${table.status} <> 'completed' and ${table.winnerTeamId} is null)`),
	check('matches_time_order', sql`${table.endedAt} >= ${table.startedAt}`)
]);

// scrimId는 같은 내전의 Game·참가자만 연결하도록 복합 외래키에 사용한다.
export const games = pgTable('games', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull(),
	matchId: uuid('match_id').notNull(),
	gameNumber: integer('game_number').notNull(),
	// 블루 진영이 Match의 A/B 중 어느 팀인지 저장한다. 레드는 나머지 팀이므로 중복 저장하지 않는다.
	blueTeamSlot: matchTeamSlot('blue_team_slot').notNull(),
	status: gameStatus('status').default('pending').notNull(),
	winnerSide: gameSide('winner_side'),
	// 실제 경기 시각을 확인한 경우에만 저장한다. 업로드 시각과 경기 길이로 시작 시각을 추정하지 않는다.
	startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }),
	endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }),
	// 검증해서 채택한 선별 ROFL 결과만 참조한다. 메타데이터가 consistent여도 자동 승인하지 않는다.
	// 같은 파일의 다른 projectionVersion을 별개 경기로 재등록하지 않도록 채택 시 서비스에서 검사한다.
	// 채택본 교체 시 기존 참가자 연결을 해제하고 새 인덱스 매핑을 검증해 같은 트랜잭션에서 다시 연결한다.
	roflMetadataId: uuid('rofl_metadata_id').unique().references(() => roflMetadata.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	unique('games_match_number_unique').on(table.matchId, table.gameNumber),
	unique('games_scrim_id_id_unique').on(table.scrimId, table.id),
	unique('games_id_rofl_metadata_unique').on(table.id, table.roflMetadataId),
	foreignKey({
		name: 'games_match_fk',
		columns: [table.scrimId, table.matchId], foreignColumns: [matches.scrimId, matches.id]
	}).onDelete('restrict'),
	check('games_number_positive', sql`${table.gameNumber} > 0`),
	check('games_completed_requires_rofl', sql`${table.status} <> 'completed' or ${table.roflMetadataId} is not null`),
	check('games_winner_requires_completion', sql`(${table.status} = 'completed' and ${table.winnerSide} is not null) or (${table.status} <> 'completed' and ${table.winnerSide} is null)`),
	check('games_time_order', sql`${table.endedAt} >= ${table.startedAt}`)
]);

// 실제 한 판의 출전 기록이다. 미연결 ROFL 참가자의 선별 데이터는 버전별 ROFL 하위 모델에 남긴다.
// 팀 소속·실제 사용 계정·5인 라인업·피어리스·Game 순번과 시리즈 종료 조건은 저장 시 서비스에서 검사한다.
export const gameParticipants = pgTable('game_participants', {
	scrimId: uuid('scrim_id').notNull(),
	gameId: uuid('game_id').notNull(),
	scrimParticipantId: uuid('scrim_participant_id').notNull(),
	riotAccountId: uuid('riot_account_id').references(() => riotAccounts.id, { onDelete: 'restrict' }),
	// 당시의 표시 이름·Riot ID·진영·포지션을 저장하며 현재 프로필이나 팀 편성으로 덮어쓰지 않는다.
	displayName: text('display_name').notNull(),
	riotGameName: text('riot_game_name'),
	riotTagLine: text('riot_tag_line'),
	side: gameSide('side').notNull(),
	position: lolPosition('position'),
	// 숫자 챔피언 ID는 검증된 카탈로그 매핑 후에만 채운다. 선별 ROFL 결과의 SKIN 문자열과 구분한다.
	championId: integer('champion_id'),
	// 버전 공통 참가자 키로 연결하므로 V2가 추가되어도 운영 경기의 외래키 구조는 유지한다.
	roflMetadataId: uuid('rofl_metadata_id'),
	roflParticipantIndex: integer('rofl_participant_index'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	primaryKey({ columns: [table.gameId, table.scrimParticipantId] }),
	unique('game_participants_account_unique').on(table.gameId, table.riotAccountId),
	unique('game_participants_side_position_unique').on(table.gameId, table.side, table.position),
	unique('game_participants_rofl_index_unique').on(table.gameId, table.roflParticipantIndex),
	foreignKey({
		name: 'game_participants_game_fk',
		columns: [table.scrimId, table.gameId], foreignColumns: [games.scrimId, games.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'game_participants_participant_fk',
		columns: [table.scrimId, table.scrimParticipantId], foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'game_participants_selected_rofl_fk',
		columns: [table.gameId, table.roflMetadataId], foreignColumns: [games.id, games.roflMetadataId]
	}).onDelete('restrict'),
	foreignKey({
		name: 'game_participants_rofl_participant_fk',
		columns: [table.roflMetadataId, table.roflParticipantIndex], foreignColumns: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
	}).onDelete('restrict'),
	index('game_participants_participant_id_idx').on(table.scrimParticipantId),
	index('game_participants_riot_account_id_idx').on(table.riotAccountId),
	check('game_participants_champion_id_positive', sql`${table.championId} > 0`),
	check('game_participants_rofl_source_pair', sql`(${table.roflMetadataId} is null and ${table.roflParticipantIndex} is null) or (${table.roflMetadataId} is not null and ${table.roflParticipantIndex} is not null)`)
]);

// 조회용 관계와 위의 DB 외래키 제약을 함께 유지한다.
export const usersRelations = relations(users, ({ many }) => ({
	memberships: many(guildMembers),
	riotAccounts: many(riotAccounts),
	createdScrims: many(scrims),
	championPreferences: many(userChampionPreferences),
	scrimParticipations: many(scrimParticipants),
	uploadedRoflResults: many(roflMetadata)
}));

export const userChampionPreferencesRelations = relations(userChampionPreferences, ({ one }) => ({
	user: one(users, { fields: [userChampionPreferences.userId], references: [users.id] })
}));

export const guildsRelations = relations(guilds, ({ many }) => ({
	members: many(guildMembers),
	scrims: many(scrims)
}));

export const guildMembersRelations = relations(guildMembers, ({ one }) => ({
	guild: one(guilds, { fields: [guildMembers.guildId], references: [guilds.id] }),
	user: one(users, { fields: [guildMembers.userId], references: [users.id] })
}));

export const riotAccountsRelations = relations(riotAccounts, ({ one, many }) => ({
	user: one(users, { fields: [riotAccounts.userId], references: [users.id] }),
	scrimParticipations: many(scrimParticipants),
	gameParticipations: many(gameParticipants)
}));

export const scrimsRelations = relations(scrims, ({ one, many }) => ({
	guild: one(guilds, { fields: [scrims.guildId], references: [guilds.id] }),
	creator: one(users, { fields: [scrims.createdByUserId], references: [users.id] }),
	teams: many(scrimTeams),
	participants: many(scrimParticipants),
	matches: many(matches)
}));

export const scrimTeamsRelations = relations(scrimTeams, ({ one, many }) => ({
	scrim: one(scrims, { fields: [scrimTeams.scrimId], references: [scrims.id] }),
	participants: many(scrimParticipants),
	matchesAsTeamA: many(matches, { relationName: 'matchTeamA' }),
	matchesAsTeamB: many(matches, { relationName: 'matchTeamB' }),
	wonMatches: many(matches, { relationName: 'matchWinner' })
}));

export const scrimParticipantsRelations = relations(scrimParticipants, ({ one, many }) => ({
	scrim: one(scrims, { fields: [scrimParticipants.scrimId], references: [scrims.id] }),
	user: one(users, { fields: [scrimParticipants.userId], references: [users.id] }),
	riotAccount: one(riotAccounts, { fields: [scrimParticipants.riotAccountId], references: [riotAccounts.id] }),
	team: one(scrimTeams, {
		fields: [scrimParticipants.scrimId, scrimParticipants.teamId], references: [scrimTeams.scrimId, scrimTeams.id]
	}),
	gameParticipations: many(gameParticipants)
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
	scrim: one(scrims, { fields: [matches.scrimId], references: [scrims.id] }),
	teamA: one(scrimTeams, {
		fields: [matches.scrimId, matches.teamAId], references: [scrimTeams.scrimId, scrimTeams.id], relationName: 'matchTeamA'
	}),
	teamB: one(scrimTeams, {
		fields: [matches.scrimId, matches.teamBId], references: [scrimTeams.scrimId, scrimTeams.id], relationName: 'matchTeamB'
	}),
	winner: one(scrimTeams, {
		fields: [matches.scrimId, matches.winnerTeamId], references: [scrimTeams.scrimId, scrimTeams.id], relationName: 'matchWinner'
	}),
	games: many(games)
}));

export const roflMetadataRelations = relations(roflMetadata, ({ one, many }) => ({
	uploadedBy: one(users, { fields: [roflMetadata.uploadedByUserId], references: [users.id] }),
	game: one(games),
	gameDataV1: one(roflGameDataV1),
	participants: many(roflParticipants)
}));

export const roflParticipantsRelations = relations(roflParticipants, ({ one }) => ({
	metadata: one(roflMetadata, { fields: [roflParticipants.roflMetadataId], references: [roflMetadata.id] }),
	dataV1: one(roflParticipantDataV1),
	gameParticipation: one(gameParticipants)
}));

export const roflGameDataV1Relations = relations(roflGameDataV1, ({ one, many }) => ({
	metadata: one(roflMetadata, {
		fields: [roflGameDataV1.roflMetadataId, roflGameDataV1.projectionVersion], references: [roflMetadata.id, roflMetadata.projectionVersion]
	}),
	participants: many(roflParticipantDataV1)
}));

export const roflParticipantDataV1Relations = relations(roflParticipantDataV1, ({ one }) => ({
	gameData: one(roflGameDataV1, { fields: [roflParticipantDataV1.roflMetadataId], references: [roflGameDataV1.roflMetadataId] }),
	participant: one(roflParticipants, {
		fields: [roflParticipantDataV1.roflMetadataId, roflParticipantDataV1.participantIndex], references: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
	})
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
	match: one(matches, { fields: [games.scrimId, games.matchId], references: [matches.scrimId, matches.id] }),
	roflMetadata: one(roflMetadata, { fields: [games.roflMetadataId], references: [roflMetadata.id] }),
	participants: many(gameParticipants)
}));

export const gameParticipantsRelations = relations(gameParticipants, ({ one }) => ({
	game: one(games, { fields: [gameParticipants.scrimId, gameParticipants.gameId], references: [games.scrimId, games.id] }),
	participant: one(scrimParticipants, {
		fields: [gameParticipants.scrimId, gameParticipants.scrimParticipantId], references: [scrimParticipants.scrimId, scrimParticipants.id]
	}),
	riotAccount: one(riotAccounts, { fields: [gameParticipants.riotAccountId], references: [riotAccounts.id] }),
	roflParticipant: one(roflParticipants, {
		fields: [gameParticipants.roflMetadataId, gameParticipants.roflParticipantIndex], references: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
	})
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserChampionPreference = typeof userChampionPreferences.$inferSelect;
export type NewUserChampionPreference = typeof userChampionPreferences.$inferInsert;
export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;
export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
export type RiotAccount = typeof riotAccounts.$inferSelect;
export type NewRiotAccount = typeof riotAccounts.$inferInsert;
export type Scrim = typeof scrims.$inferSelect;
export type NewScrim = typeof scrims.$inferInsert;
export type ScrimTeam = typeof scrimTeams.$inferSelect;
export type NewScrimTeam = typeof scrimTeams.$inferInsert;
export type ScrimParticipant = typeof scrimParticipants.$inferSelect;
export type NewScrimParticipant = typeof scrimParticipants.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameParticipant = typeof gameParticipants.$inferSelect;
export type NewGameParticipant = typeof gameParticipants.$inferInsert;
export type RoflMetadata = typeof roflMetadata.$inferSelect;
export type NewRoflMetadata = typeof roflMetadata.$inferInsert;
export type RoflParticipant = typeof roflParticipants.$inferSelect;
export type NewRoflParticipant = typeof roflParticipants.$inferInsert;
export type RoflGameDataV1 = typeof roflGameDataV1.$inferSelect;
export type NewRoflGameDataV1 = typeof roflGameDataV1.$inferInsert;
export type RoflParticipantDataV1 = typeof roflParticipantDataV1.$inferSelect;
export type NewRoflParticipantDataV1 = typeof roflParticipantDataV1.$inferInsert;
