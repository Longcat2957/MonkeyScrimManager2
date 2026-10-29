import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
	// 모집 때 안내한 예정 시각이며 실제 경기 시작 시각과 구분한다.
	expectedStartAt: timestamp('expected_start_at', { withTimezone: true, precision: 3 }),
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

// 경매는 시작 전후에 취소할 수 있으며, 내전 경기의 중도 종료와는 구분한다.
export const auctionStatus = pgEnum('auction_status', ['setup', 'in_progress', 'completed', 'cancelled']);

// 내전 하나에 경매 하나를 연결한다. 준비 단계로 되돌려도 같은 경매와 이력을 유지한다.
// 경매 방식의 Scrim인지와 상태 전환 조건은 서비스에서 검증한다.
export const auctions = pgTable('auctions', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull().unique().references(() => scrims.id, { onDelete: 'restrict' }),
	status: auctionStatus('status').default('setup').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }),
	endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	// 경매 팀·참가자가 같은 내전에 속하는지 검사할 복합 외래키의 대상이다.
	unique('auctions_scrim_id_id_unique').on(table.scrimId, table.id),
	check('auctions_time_order', sql`${table.endedAt} >= ${table.startedAt}`)
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

// 경매에 참여하는 팀의 팀장과 시작 예산을 보관한다.
// 한 번 시작한 경매의 팀·팀장·시작 예산 변경 금지와 팀장의 실제 팀 소속은 서비스에서 검사한다.
export const auctionTeams = pgTable('auction_teams', {
	scrimId: uuid('scrim_id').notNull(),
	auctionId: uuid('auction_id').notNull(),
	teamId: uuid('team_id').notNull(),
	// 사용자 계정 대신 보존되는 참가 기록을 참조한다.
	captainParticipantId: uuid('captain_participant_id').notNull(),
	// 시작 포인트는 명시적으로 지정한다. 잔여 포인트는 이후 유효한 영입 내역에서 계산한다.
	initialPoints: integer('initial_points').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	primaryKey({ columns: [table.auctionId, table.teamId] }),
	unique('auction_teams_scrim_auction_team_unique').on(table.scrimId, table.auctionId, table.teamId),
	unique('auction_teams_captain_unique').on(table.auctionId, table.captainParticipantId),
	// 경매·팀·팀장이 같은 내전에 속하도록 공통 scrimId로 각각 연결한다.
	foreignKey({
		name: 'auction_teams_auction_fk',
		columns: [table.scrimId, table.auctionId], foreignColumns: [auctions.scrimId, auctions.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_teams_team_fk',
		columns: [table.scrimId, table.teamId], foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_teams_captain_fk',
		columns: [table.scrimId, table.captainParticipantId], foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
	}).onDelete('restrict'),
	index('auction_teams_team_id_idx').on(table.teamId),
	index('auction_teams_captain_participant_id_idx').on(table.captainParticipantId),
	check('auction_teams_initial_points_nonnegative', sql`${table.initialPoints} >= 0`)
]);

export const auctionLotStatus = pgEnum('auction_lot_status', ['open', 'sold', 'unsold', 'cancelled']);

// 참가자가 경매에 등장한 한 번의 시도다. 유찰 후 재등장·재추첨은 이전 기록을 보존하고 새 행으로 남긴다.
// 상태 전환과 팀장·이미 영입된 참가자의 후보 제외는 서비스에서 검사한다.
export const auctionLots = pgTable('auction_lots', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull(),
	auctionId: uuid('auction_id').notNull(),
	scrimParticipantId: uuid('scrim_participant_id').notNull(),
	// 경매 전체의 등장 순서이며, 취소된 시도의 순번도 다시 사용하지 않는다.
	sequenceNumber: integer('sequence_number').notNull(),
	// 등장 당시 기준 포지션이다. 미지정은 null이며 이후 팀 배정 포지션으로 덮어쓰지 않는다.
	position: lolPosition('position'),
	status: auctionLotStatus('status').default('open').notNull(),
	openedAt: timestamp('opened_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	closedAt: timestamp('closed_at', { withTimezone: true, precision: 3 }),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	unique('auction_lots_sequence_unique').on(table.auctionId, table.sequenceNumber),
	unique('auction_lots_auction_participant_id_unique').on(table.auctionId, table.scrimParticipantId, table.id),
	// 종료된 시도와 재등장은 보존하면서 경매당 현재 후보만 하나로 제한한다.
	uniqueIndex('auction_lots_open_auction_unique').on(table.auctionId).where(sql`${table.status} = 'open'`),
	foreignKey({
		name: 'auction_lots_auction_fk',
		columns: [table.scrimId, table.auctionId], foreignColumns: [auctions.scrimId, auctions.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_lots_participant_fk',
		columns: [table.scrimId, table.scrimParticipantId], foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
	}).onDelete('restrict'),
	index('auction_lots_participant_id_idx').on(table.scrimParticipantId),
	check('auction_lots_sequence_positive', sql`${table.sequenceNumber} > 0`),
	check('auction_lots_closed_at_matches_status', sql`(${table.status} = 'open' and ${table.closedAt} is null) or (${table.status} <> 'open' and ${table.closedAt} is not null)`),
	check('auction_lots_time_order', sql`${table.closedAt} >= ${table.openedAt}`)
]);

export const auctionAcquisitionMethod = pgEnum('auction_acquisition_method', ['auction', 'manual']);

// 낙찰·수동 영입의 원장이다. 실제 구매 팀장과 값을 입력한 운영자를 구분한다.
// 금액·대상·구매자 정정은 이전 행을 무효화하고 새 행으로 연결하며 원래 거래값을 덮어쓰지 않는다.
// 이전 행의 무효 여부·정정 순환·팀장 일치·예산·팀 정원과 팀 배정의 동시 변경은 서비스에서 검사한다.
// 기본 가격 통계는 완료된 경매의 유효 auction 행만 집계한다. 수동 배정과 팀장 편입은 낙찰 건수가 아니다.
export const auctionAcquisitions = pgTable('auction_acquisitions', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull(),
	auctionId: uuid('auction_id').notNull(),
	scrimParticipantId: uuid('scrim_participant_id').notNull(),
	teamId: uuid('team_id').notNull(),
	// 당시 구매자를 고정한다. 현재 팀장 값의 변경으로 과거 구매자를 다시 계산하지 않는다.
	buyerParticipantId: uuid('buyer_participant_id'),
	method: auctionAcquisitionMethod('method').notNull(),
	// 0점 낙찰은 0이며, 가격 없는 수동 배정은 null이다.
	price: integer('price'),
	// 수동 배정도 앞선 유찰 시도가 있다면 연결할 수 있다.
	lotId: uuid('lot_id'),
	recordedByUserId: text('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	acquiredAt: timestamp('acquired_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	voidedAt: timestamp('voided_at', { withTimezone: true, precision: 3 }),
	voidedByUserId: text('voided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	voidReason: text('void_reason'),
	supersedesId: uuid('supersedes_id'),
}, (table) => [
	unique('auction_acquisitions_auction_id_unique').on(table.auctionId, table.id),
	unique('auction_acquisitions_supersedes_unique').on(table.supersedesId),
	uniqueIndex('auction_acquisitions_active_participant_unique')
		.on(table.auctionId, table.scrimParticipantId).where(sql`${table.voidedAt} is null`),
	foreignKey({
		name: 'auction_acquisitions_auction_fk',
		columns: [table.scrimId, table.auctionId], foreignColumns: [auctions.scrimId, auctions.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_acquisitions_team_fk',
		columns: [table.scrimId, table.auctionId, table.teamId],
		foreignColumns: [auctionTeams.scrimId, auctionTeams.auctionId, auctionTeams.teamId]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_acquisitions_participant_fk',
		columns: [table.scrimId, table.scrimParticipantId], foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_acquisitions_buyer_fk',
		columns: [table.scrimId, table.buyerParticipantId], foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_acquisitions_lot_fk',
		columns: [table.auctionId, table.scrimParticipantId, table.lotId],
		foreignColumns: [auctionLots.auctionId, auctionLots.scrimParticipantId, auctionLots.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'auction_acquisitions_supersedes_fk',
		columns: [table.auctionId, table.supersedesId],
		foreignColumns: [table.auctionId, table.id]
	}).onDelete('restrict'),
	index('auction_acquisitions_team_idx').on(table.auctionId, table.teamId),
	index('auction_acquisitions_participant_idx').on(table.scrimParticipantId),
	index('auction_acquisitions_buyer_idx').on(table.buyerParticipantId),
	index('auction_acquisitions_recorder_idx').on(table.recordedByUserId),
	index('auction_acquisitions_voider_idx').on(table.voidedByUserId),
	check('auction_acquisitions_method_values', sql`(${table.method} = 'auction' and ${table.price} is not null and ${table.price} >= 0 and ${table.lotId} is not null and ${table.buyerParticipantId} is not null) or (${table.method} = 'manual' and ${table.price} is null and ${table.buyerParticipantId} is null)`),
	check('auction_acquisitions_buyer_not_target', sql`${table.buyerParticipantId} is null or ${table.buyerParticipantId} <> ${table.scrimParticipantId}`),
	check('auction_acquisitions_not_self_correction', sql`${table.supersedesId} is null or ${table.supersedesId} <> ${table.id}`),
	check('auction_acquisitions_void_details', sql`(${table.voidedAt} is null and ${table.voidedByUserId} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.voidReason} is not null and length(btrim(${table.voidReason})) > 0)`),
	check('auction_acquisitions_void_time', sql`${table.voidedAt} >= ${table.acquiredAt}`)
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
	// 메타데이터 일관성만 나타낸다. 등록 권한·참가자 연결·중복 여부는 저장 단계에서 별도로 검증한다.
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
	// Scrim 기본값을 생성 시 명시적으로 저장한다. 안내 기준은 이 Match의 이전 Game에서 양 팀이 사용한 픽이다.
	// 피어리스 위반은 안내로 처리하며 ROFL 업로드나 경기 결과 등록을 막지 않는다.
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
	// 등록 권한·참가자 연결·중복·결과 일관성을 검증한 ROFL 결과를 자동 등록한다.
	// 같은 파일의 다른 projectionVersion을 별개 경기로 재등록하지 않도록 채택 시 서비스에서 검사한다.
	// 채택본 교체 시 새 인덱스 매핑을 검증하고, 기존 출전 행 삭제·메타 교체·새 출전 행 생성을 한 트랜잭션에서 처리한다.
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
// 팀 소속·실제 사용 계정·5인 라인업·Game 순번과 시리즈 종료 조건은 저장 시 서비스에서 검사한다.
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
	// 출전 기록에는 ROFL 근거가 필수이며, 아직 연결하지 못한 원본 참가자는 roflParticipants에만 남긴다.
	roflMetadataId: uuid('rofl_metadata_id').notNull(),
	roflParticipantIndex: integer('rofl_participant_index').notNull(),
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
	index('game_participants_rofl_participant_idx').on(table.roflMetadataId, table.roflParticipantIndex),
	check('game_participants_champion_id_positive', sql`${table.championId} > 0`)
]);

// 모집 시 일반 단일 라운드 또는 준결승·결승의 BO 규칙을 정한다. Match 생성 시 해당 규칙을 복사한다.
// Match 생성 후 라운드 규칙 변경은 서비스에서 제한한다.
export const scrimRounds = pgTable('scrim_rounds', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull().references(() => scrims.id, { onDelete: 'restrict' }),
	roundNumber: integer('round_number').notNull(),
	label: text('label').notNull(),
	bestOf: integer('best_of').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	unique('scrim_rounds_scrim_id_id_unique').on(table.scrimId, table.id),
	unique('scrim_rounds_number_unique').on(table.scrimId, table.roundNumber),
	check('scrim_rounds_number_positive', sql`${table.roundNumber} > 0`),
	check('scrim_rounds_best_of_positive_odd', sql`${table.bestOf} > 0 and ${table.bestOf} % 2 = 1`)
]);

// 대진표의 계획 경기다. 양 팀이 결정되면 실제 Match를 만들고 연결하며, 팀 미정 결승도 미리 보관할 수 있다.
// 라운드 진행 순서·순환 참조·슬롯과 실제 Match 팀의 일치 및 확정 후 변경 제한은 서비스에서 검사한다.
export const scrimBracketNodes = pgTable('scrim_bracket_nodes', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimId: uuid('scrim_id').notNull(),
	roundId: uuid('round_id').notNull(),
	matchNumber: integer('match_number').notNull(),
	matchId: uuid('match_id').unique(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	unique('scrim_bracket_nodes_scrim_id_id_unique').on(table.scrimId, table.id),
	unique('scrim_bracket_nodes_number_unique').on(table.roundId, table.matchNumber),
	foreignKey({
		name: 'scrim_bracket_nodes_round_fk',
		columns: [table.scrimId, table.roundId], foreignColumns: [scrimRounds.scrimId, scrimRounds.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'scrim_bracket_nodes_match_fk',
		columns: [table.scrimId, table.matchId], foreignColumns: [matches.scrimId, matches.id]
	}).onDelete('restrict'),
	check('scrim_bracket_nodes_number_positive', sql`${table.matchNumber} > 0`)
]);

// A/B 자리마다 직접 배정한 팀 또는 이전 대진의 승자를 지정한다. 둘 다 null이면 아직 미정인 자리다.
// sourceNodeId는 승자 진출만 뜻한다. 중도 종료처럼 승자가 없는 경기를 임의로 진출시키지 않는다.
// 승자가 정해져도 진출 원본 연결은 유지하고, 실제 대진 팀은 연결된 Match에 기록한다.
export const scrimBracketSlots = pgTable('scrim_bracket_slots', {
	scrimId: uuid('scrim_id').notNull(),
	nodeId: uuid('node_id').notNull(),
	slot: matchTeamSlot('slot').notNull(),
	teamId: uuid('team_id'),
	sourceNodeId: uuid('source_node_id'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
}, (table) => [
	primaryKey({ columns: [table.nodeId, table.slot] }),
	unique('scrim_bracket_slots_team_unique').on(table.nodeId, table.teamId),
	// 한 경기의 승자가 대진표의 여러 자리로 동시에 진출하지 않도록 한다.
	unique('scrim_bracket_slots_source_unique').on(table.sourceNodeId),
	foreignKey({
		name: 'scrim_bracket_slots_node_fk',
		columns: [table.scrimId, table.nodeId], foreignColumns: [scrimBracketNodes.scrimId, scrimBracketNodes.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'scrim_bracket_slots_team_fk',
		columns: [table.scrimId, table.teamId], foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
	}).onDelete('restrict'),
	foreignKey({
		name: 'scrim_bracket_slots_source_fk',
		columns: [table.scrimId, table.sourceNodeId], foreignColumns: [scrimBracketNodes.scrimId, scrimBracketNodes.id]
	}).onDelete('restrict'),
	index('scrim_bracket_slots_team_id_idx').on(table.teamId),
	check('scrim_bracket_slots_source_exclusive', sql`${table.teamId} is null or ${table.sourceNodeId} is null`),
	check('scrim_bracket_slots_not_self', sql`${table.sourceNodeId} <> ${table.nodeId}`)
]);

// 설정이 없으면 비공개 기본값을 적용한다. 과거 경기의 Riot ID 스냅샷 표시에도 현재 공개 설정을 적용한다.
// 이 설정은 공개 범위만 결정하며 길드 내부 경기 기록을 삭제하거나 통계에서 제외하지 않는다.
export const userPrivacySettings = pgTable('user_privacy_settings', {
	userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
	publicProfileEnabled: boolean('public_profile_enabled').default(false).notNull(),
	showRiotIds: boolean('show_riot_ids').default(false).notNull(),
	allowExternalRecordSearch: boolean('allow_external_record_search').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
});

// 채널이 해당 길드에 속하는지와 봇의 게시 권한은 Discord 연동 시 확인한다.
export const guildDiscordSettings = pgTable('guild_discord_settings', {
	guildId: text('guild_id').primaryKey().references(() => guilds.id, { onDelete: 'cascade' }),
	recruitmentChannelId: text('recruitment_channel_id'),
	resultChannelId: text('result_channel_id'),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
});

// 웹 변경과 봇 재시작 후에도 같은 모집 카드를 갱신하도록 실제 게시물의 위치를 보관한다.
export const scrimDiscordMessages = pgTable('scrim_discord_messages', {
	scrimId: uuid('scrim_id').primaryKey().references(() => scrims.id, { onDelete: 'restrict' }),
	channelId: text('channel_id').notNull(),
	messageId: text('message_id').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
		.defaultNow().notNull().$onUpdate(() => new Date())
});

// 신청 시 희망 포지션과 우선순위다. 실제 배정 포지션은 scrimParticipants.position에 보관한다.
export const scrimParticipantPreferences = pgTable('scrim_participant_preferences', {
	scrimParticipantId: uuid('scrim_participant_id').notNull()
		.references(() => scrimParticipants.id, { onDelete: 'restrict' }),
	position: lolPosition('position').notNull(),
	priority: integer('priority').notNull()
}, (table) => [
	primaryKey({ columns: [table.scrimParticipantId, table.position] }),
	unique('scrim_participant_preferences_priority_unique').on(table.scrimParticipantId, table.priority),
	check('scrim_participant_preferences_priority_range', sql`${table.priority} between 1 and 5`)
]);

// 참가자 ID는 유지하고 참가 신청마다 한 행을 만든다. 철회한 행을 재사용하지 않아 재참가 이력이 남는다.
// withdrawnAt이 없는 행이 현재 참가 신청이다. 참가자 생성과 첫 신청, 철회·재참가는 서비스에서 원자적으로 처리한다.
// 정원 검사, 시작 후 철회 제한, 철회 시 미확정 팀 배정 정리는 서비스에서 처리한다.
export const scrimParticipantRegistrations = pgTable('scrim_participant_registrations', {
	id: uuid('id').defaultRandom().primaryKey(),
	scrimParticipantId: uuid('scrim_participant_id').notNull()
		.references(() => scrimParticipants.id, { onDelete: 'restrict' }),
	joinedAt: timestamp('joined_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
	joinedByUserId: text('joined_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	withdrawnAt: timestamp('withdrawn_at', { withTimezone: true, precision: 3 }),
	withdrawnByUserId: text('withdrawn_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	withdrawalReason: text('withdrawal_reason')
}, (table) => [
	uniqueIndex('scrim_participant_registrations_active_unique').on(table.scrimParticipantId)
		.where(sql`${table.withdrawnAt} is null`),
	index('scrim_participant_registrations_history_idx').on(table.scrimParticipantId, table.joinedAt),
	index('scrim_participant_registrations_joined_by_idx').on(table.joinedByUserId),
	index('scrim_participant_registrations_withdrawn_by_idx').on(table.withdrawnByUserId),
	check('scrim_participant_registrations_time_order', sql`${table.withdrawnAt} >= ${table.joinedAt}`),
	check('scrim_participant_registrations_withdrawal_details', sql`${table.withdrawnAt} is not null or (${table.withdrawnByUserId} is null and ${table.withdrawalReason} is null)`)
]);

// 조회용 관계와 위의 DB 외래키 제약을 함께 유지한다.
export const usersRelations = relations(users, ({ one, many }) => ({
	privacySettings: one(userPrivacySettings),
	memberships: many(guildMembers),
	riotAccounts: many(riotAccounts),
	createdScrims: many(scrims),
	championPreferences: many(userChampionPreferences),
	scrimParticipations: many(scrimParticipants),
	uploadedRoflResults: many(roflMetadata),
	recordedAcquisitions: many(auctionAcquisitions, { relationName: 'acquisitionRecorder' }),
	voidedAcquisitions: many(auctionAcquisitions, { relationName: 'acquisitionVoider' }),
	joinedRegistrations: many(scrimParticipantRegistrations, { relationName: 'registrationJoinedBy' }),
	withdrawnRegistrations: many(scrimParticipantRegistrations, { relationName: 'registrationWithdrawnBy' })
}));

export const userChampionPreferencesRelations = relations(userChampionPreferences, ({ one }) => ({
	user: one(users, { fields: [userChampionPreferences.userId], references: [users.id] })
}));

export const guildsRelations = relations(guilds, ({ one, many }) => ({
	discordSettings: one(guildDiscordSettings),
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
	matches: many(matches),
	auction: one(auctions),
	discordMessage: one(scrimDiscordMessages),
	rounds: many(scrimRounds)
}));

export const auctionsRelations = relations(auctions, ({ one, many }) => ({
	scrim: one(scrims, { fields: [auctions.scrimId], references: [scrims.id] }),
	teams: many(auctionTeams),
	lots: many(auctionLots),
	acquisitions: many(auctionAcquisitions)
}));

export const auctionTeamsRelations = relations(auctionTeams, ({ one, many }) => ({
	acquisitions: many(auctionAcquisitions),
	auction: one(auctions, {
		fields: [auctionTeams.scrimId, auctionTeams.auctionId], references: [auctions.scrimId, auctions.id]
	}),
	team: one(scrimTeams, {
		fields: [auctionTeams.scrimId, auctionTeams.teamId], references: [scrimTeams.scrimId, scrimTeams.id]
	}),
	captain: one(scrimParticipants, {
		fields: [auctionTeams.scrimId, auctionTeams.captainParticipantId], references: [scrimParticipants.scrimId, scrimParticipants.id]
	})
}));

export const auctionLotsRelations = relations(auctionLots, ({ one, many }) => ({
	acquisitions: many(auctionAcquisitions),
	auction: one(auctions, {
		fields: [auctionLots.scrimId, auctionLots.auctionId], references: [auctions.scrimId, auctions.id]
	}),
	participant: one(scrimParticipants, {
		fields: [auctionLots.scrimId, auctionLots.scrimParticipantId], references: [scrimParticipants.scrimId, scrimParticipants.id]
	})
}));

export const auctionAcquisitionsRelations = relations(auctionAcquisitions, ({ one, many }) => ({
	auction: one(auctions, {
		fields: [auctionAcquisitions.scrimId, auctionAcquisitions.auctionId], references: [auctions.scrimId, auctions.id]
	}),
	team: one(auctionTeams, {
		fields: [auctionAcquisitions.scrimId, auctionAcquisitions.auctionId, auctionAcquisitions.teamId],
		references: [auctionTeams.scrimId, auctionTeams.auctionId, auctionTeams.teamId]
	}),
	participant: one(scrimParticipants, {
		fields: [auctionAcquisitions.scrimId, auctionAcquisitions.scrimParticipantId],
		references: [scrimParticipants.scrimId, scrimParticipants.id], relationName: 'acquisitionTarget'
	}),
	buyer: one(scrimParticipants, {
		fields: [auctionAcquisitions.scrimId, auctionAcquisitions.buyerParticipantId],
		references: [scrimParticipants.scrimId, scrimParticipants.id], relationName: 'acquisitionBuyer'
	}),
	lot: one(auctionLots, {
		fields: [auctionAcquisitions.auctionId, auctionAcquisitions.scrimParticipantId, auctionAcquisitions.lotId],
		references: [auctionLots.auctionId, auctionLots.scrimParticipantId, auctionLots.id]
	}),
	recordedBy: one(users, {
		fields: [auctionAcquisitions.recordedByUserId], references: [users.id], relationName: 'acquisitionRecorder'
	}),
	voidedBy: one(users, {
		fields: [auctionAcquisitions.voidedByUserId], references: [users.id], relationName: 'acquisitionVoider'
	}),
	supersedes: one(auctionAcquisitions, {
		fields: [auctionAcquisitions.auctionId, auctionAcquisitions.supersedesId],
		references: [auctionAcquisitions.auctionId, auctionAcquisitions.id], relationName: 'acquisitionCorrection'
	}),
	// UNIQUE 제약으로 정정 후속 행은 최대 하나다.
	replacements: many(auctionAcquisitions, { relationName: 'acquisitionCorrection' })
}));

export const scrimTeamsRelations = relations(scrimTeams, ({ one, many }) => ({
	scrim: one(scrims, { fields: [scrimTeams.scrimId], references: [scrims.id] }),
	participants: many(scrimParticipants),
	auctionTeam: one(auctionTeams),
	bracketSlots: many(scrimBracketSlots),
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
	captainedAuctionTeam: one(auctionTeams),
	auctionLots: many(auctionLots),
	acquisitions: many(auctionAcquisitions, { relationName: 'acquisitionTarget' }),
	purchases: many(auctionAcquisitions, { relationName: 'acquisitionBuyer' }),
	preferences: many(scrimParticipantPreferences),
	registrations: many(scrimParticipantRegistrations),
	gameParticipations: many(gameParticipants)
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
	bracketNode: one(scrimBracketNodes),
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

export const scrimRoundsRelations = relations(scrimRounds, ({ one, many }) => ({
	scrim: one(scrims, { fields: [scrimRounds.scrimId], references: [scrims.id] }),
	nodes: many(scrimBracketNodes)
}));

export const scrimBracketNodesRelations = relations(scrimBracketNodes, ({ one, many }) => ({
	round: one(scrimRounds, {
		fields: [scrimBracketNodes.scrimId, scrimBracketNodes.roundId], references: [scrimRounds.scrimId, scrimRounds.id]
	}),
	match: one(matches, {
		fields: [scrimBracketNodes.scrimId, scrimBracketNodes.matchId], references: [matches.scrimId, matches.id]
	}),
	slots: many(scrimBracketSlots, { relationName: 'bracketNodeSlots' }),
	// UNIQUE 제약으로 승자 진출 자리는 최대 하나다.
	winnerDestinations: many(scrimBracketSlots, { relationName: 'bracketWinnerDestination' })
}));

export const scrimBracketSlotsRelations = relations(scrimBracketSlots, ({ one }) => ({
	node: one(scrimBracketNodes, {
		fields: [scrimBracketSlots.scrimId, scrimBracketSlots.nodeId], references: [scrimBracketNodes.scrimId, scrimBracketNodes.id], relationName: 'bracketNodeSlots'
	}),
	team: one(scrimTeams, {
		fields: [scrimBracketSlots.scrimId, scrimBracketSlots.teamId], references: [scrimTeams.scrimId, scrimTeams.id]
	}),
	sourceNode: one(scrimBracketNodes, {
		fields: [scrimBracketSlots.scrimId, scrimBracketSlots.sourceNodeId], references: [scrimBracketNodes.scrimId, scrimBracketNodes.id], relationName: 'bracketWinnerDestination'
	})
}));

export const userPrivacySettingsRelations = relations(userPrivacySettings, ({ one }) => ({
	user: one(users, { fields: [userPrivacySettings.userId], references: [users.id] })
}));

export const guildDiscordSettingsRelations = relations(guildDiscordSettings, ({ one }) => ({
	guild: one(guilds, { fields: [guildDiscordSettings.guildId], references: [guilds.id] })
}));

export const scrimDiscordMessagesRelations = relations(scrimDiscordMessages, ({ one }) => ({
	scrim: one(scrims, { fields: [scrimDiscordMessages.scrimId], references: [scrims.id] })
}));

export const scrimParticipantPreferencesRelations = relations(scrimParticipantPreferences, ({ one }) => ({
	participant: one(scrimParticipants, { fields: [scrimParticipantPreferences.scrimParticipantId], references: [scrimParticipants.id] })
}));

export const scrimParticipantRegistrationsRelations = relations(scrimParticipantRegistrations, ({ one }) => ({
	participant: one(scrimParticipants, { fields: [scrimParticipantRegistrations.scrimParticipantId], references: [scrimParticipants.id] }),
	joinedBy: one(users, {
		fields: [scrimParticipantRegistrations.joinedByUserId], references: [users.id], relationName: 'registrationJoinedBy'
	}),
	withdrawnBy: one(users, {
		fields: [scrimParticipantRegistrations.withdrawnByUserId], references: [users.id], relationName: 'registrationWithdrawnBy'
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
export type Auction = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;
export type AuctionTeam = typeof auctionTeams.$inferSelect;
export type NewAuctionTeam = typeof auctionTeams.$inferInsert;
export type AuctionLot = typeof auctionLots.$inferSelect;
export type NewAuctionLot = typeof auctionLots.$inferInsert;
export type AuctionAcquisition = typeof auctionAcquisitions.$inferSelect;
export type NewAuctionAcquisition = typeof auctionAcquisitions.$inferInsert;
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

export type ScrimRound = typeof scrimRounds.$inferSelect;
export type NewScrimRound = typeof scrimRounds.$inferInsert;
export type ScrimBracketNode = typeof scrimBracketNodes.$inferSelect;
export type NewScrimBracketNode = typeof scrimBracketNodes.$inferInsert;
export type ScrimBracketSlot = typeof scrimBracketSlots.$inferSelect;
export type NewScrimBracketSlot = typeof scrimBracketSlots.$inferInsert;

export type UserPrivacySettings = typeof userPrivacySettings.$inferSelect;
export type NewUserPrivacySettings = typeof userPrivacySettings.$inferInsert;
export type GuildDiscordSettings = typeof guildDiscordSettings.$inferSelect;
export type NewGuildDiscordSettings = typeof guildDiscordSettings.$inferInsert;
export type ScrimDiscordMessage = typeof scrimDiscordMessages.$inferSelect;
export type NewScrimDiscordMessage = typeof scrimDiscordMessages.$inferInsert;
export type ScrimParticipantPreference = typeof scrimParticipantPreferences.$inferSelect;
export type NewScrimParticipantPreference = typeof scrimParticipantPreferences.$inferInsert;
export type ScrimParticipantRegistration = typeof scrimParticipantRegistrations.$inferSelect;
export type NewScrimParticipantRegistration = typeof scrimParticipantRegistrations.$inferInsert;
