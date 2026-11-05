import { relations, sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    doublePrecision,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid
} from 'drizzle-orm/pg-core';

// Discord 봇에서 참가 신청하거나 웹에 로그인하면 자동으로 만든다. 별도 가입 절차는 없다.
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

// 쿠키의 원본 세션 토큰은 저장하지 않고 SHA-256 해시만 보관한다.
export const sessions = pgTable(
    'sessions',
    {
        tokenHash: text('token_hash').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull()
    },
    (table) => [
        index('sessions_user_id_idx').on(table.userId),
        index('sessions_expires_at_idx').on(table.expiresAt),
        check('sessions_token_hash_format', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
        check('sessions_expiry_order', sql`${table.expiresAt} > ${table.createdAt}`)
    ]
);

// 탑·정글·미드·바텀·서포터를 구분하며, 선호 챔피언은 사용자가 포지션별로 지정한다.
export const lolPosition = pgEnum('lol_position', ['top', 'jungle', 'mid', 'bot', 'support']);

export const userChampionPreferences = pgTable(
    'user_champion_preferences',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        position: lolPosition('position').notNull(),
        // Data Dragon 챔피언의 key를 정수로 저장한다. 실제 존재 여부는 저장 시 카탈로그로 검증한다.
        championId: integer('champion_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [
        // 같은 챔피언을 여러 포지션에 등록할 수 있지만 동일 포지션 내 중복은 허용하지 않는다.
        primaryKey({ columns: [table.userId, table.position, table.championId] }),
        check('user_champion_preferences_champion_id_positive', sql`${table.championId} > 0`)
    ]
);

export const guilds = pgTable('guilds', {
    // Discord 서버 ID를 사용한다. 서버장이 서비스에 가입했는지는 길드 생성 조건이 아니다.
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    iconHash: text('icon_hash'),
    // 봇이 나간 서버도 과거 기록은 보존하고 서비스 활성 상태만 바꾼다.
    isActive: boolean('is_active').default(true).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date())
});

// 현재 사용자와 길드의 연결 및 길드별 서비스 권한을 관리한다. 과거 경기 참가 이력과는 구분한다.
export const guildMembers = pgTable(
    'guild_members',
    {
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'cascade' }),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // 해당 길드의 서버 관리자 여부. 웹에서 직접 바꾸지 않고, 봇이 Discord 서버 관리 권한이나
        // guild_discord_settings.operator_role_id 역할 보유 여부로 동기화한다.
        isAdmin: boolean('is_admin').default(false).notNull(),
        // 역할 설정을 바꾼 뒤에도 권한을 재평가할 수 있도록 검증한 Discord 권한 근거를 보관한다.
        manageGuild: boolean('manage_guild').default(false).notNull(),
        roleIds: text('role_ids')
            .array()
            .default(sql`'{}'::text[]`)
            .notNull(),
        syncedAt: timestamp('synced_at', { withTimezone: true, precision: 3 }),
        // 서비스에 연결을 저장한 시각이며 Discord 서버 가입 시각과는 구분한다.
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [
        primaryKey({ columns: [table.guildId, table.userId] }),
        index('guild_members_user_id_idx').on(table.userId)
    ]
);

// Riot 계정 식별 정보는 공유하되 사용자 연결과 대표 계정은 길드마다 독립적으로 관리한다.
export const riotAccounts = pgTable('riot_accounts', {
    // 경기 등 서비스 내부 참조에는 이 ID를 사용하고, 외부 API 식별자는 별도로 보관한다.
    id: uuid('id').defaultRandom().primaryKey(),
    // Riot API가 반환한 PUUID만 저장한다. ROFL 원시 PUUID와 자동 연결하지 않는다.
    puuid: text('puuid').notNull().unique(),
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
});

// 같은 계정도 서버마다 서로 다른 연결을 가질 수 있다. 해제는 이 연결만 지우고 계정·출전 기록은 남긴다.
export const guildRiotAccounts = pgTable(
    'guild_riot_accounts',
    {
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'cascade' }),
        riotAccountId: uuid('riot_account_id')
            .notNull()
            .references(() => riotAccounts.id, { onDelete: 'restrict' }),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        isPrimary: boolean('is_primary').default(false).notNull(),
        linkedByUserId: text('linked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        linkedAt: timestamp('linked_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [
        primaryKey({ columns: [table.guildId, table.riotAccountId] }),
        index('guild_riot_accounts_user_idx').on(table.userId, table.guildId),
        index('guild_riot_accounts_linker_idx').on(table.linkedByUserId),
        uniqueIndex('guild_riot_accounts_primary_unique')
            .on(table.guildId, table.userId)
            .where(sql`${table.isPrimary}`)
    ]
);

// 시즌을 닫아도 이전 점수와 원장은 보존한다. 길드마다 종료되지 않은 시즌은 하나다.
export const mmrSeasons = pgTable(
    'mmr_seasons',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'restrict' }),
        name: text('name').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 })
    },
    (table) => [
        unique('mmr_seasons_guild_id_id_unique').on(table.guildId, table.id),
        uniqueIndex('mmr_seasons_active_guild_unique')
            .on(table.guildId)
            .where(sql`${table.endedAt} is null`),
        check('mmr_seasons_time_order', sql`${table.endedAt} >= ${table.startedAt}`)
    ]
);

// 서버·시즌·Discord 사용자·포지션별 MMR이다. Riot 계정이나 현재 길드 소속에 점수를 귀속하지 않는다.
// 기본값은 1500이며 동포지션 Elo K=32를 개별 Game마다 반영한다. 계산과 원장·현재값의 원자적 갱신은 서비스에서 처리한다.
// 원장이 생긴 뒤 시즌·사용자·포지션을 다른 대상으로 변경하지 않는다. 사용자 삭제 시 연결 해제만 예외다.
export const userPositionMmr = pgTable(
    'user_position_mmr',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        seasonId: uuid('season_id')
            .notNull()
            .references(() => mmrSeasons.id, { onDelete: 'restrict' }),
        // 사용자 삭제 시 점수·원장은 남기고 개인 연결만 해제한다. 길드 탈퇴는 이 행을 삭제하지 않는다.
        userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
        position: lolPosition('position').notNull(),
        mmr: doublePrecision('mmr').default(1500).notNull(),
        // 마지막 원장 revision과 일치해야 한다. 동시 갱신과 연속성은 서비스 트랜잭션에서 검증한다.
        revision: integer('revision').default(0).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('user_position_mmr_season_user_position_unique').on(
            table.seasonId,
            table.userId,
            table.position
        ),
        unique('user_position_mmr_season_id_id_unique').on(table.seasonId, table.id),
        index('user_position_mmr_user_id_idx').on(table.userId),
        check(
            'user_position_mmr_finite',
            sql`${table.mmr} > '-Infinity'::double precision and ${table.mmr} < 'Infinity'::double precision`
        ),
        check('user_position_mmr_revision_nonnegative', sql`${table.revision} >= 0`)
    ]
);

// completed는 정상 종료, ended_early는 경기 시작 후 중도 종료, cancelled는 시작 전 취소다.
export const scrimStatus = pgEnum('scrim_status', [
    'recruit',
    'preparing',
    'ready',
    'in_progress',
    'completed',
    'ended_early',
    'cancelled'
]);

export const scrimFormationMethod = pgEnum('scrim_formation_method', ['manual', 'auction']);

// 모집부터 종료까지 같은 내전을 유지한다. 기록된 Game이 있으면 팀을 다시 편성하지 않는다.
// 무결과 시작 취소와 단계별 변경 조건은 서비스 로직에서 검사한다.
// 중도 종료 시 확정된 Game 결과와 Match 점수는 보존하며, 미완료 시리즈의 승자를 임의로 확정하지 않는다.
export const scrims = pgTable(
    'scrims',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        // 내전 기록이 남은 길드는 실수로 함께 삭제되지 않도록 제한한다.
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'restrict' }),
        // 신규 모집은 활성 시즌을 고정한다. 기존 미지정 기록은 보존하며 늦은 업로드를 현재 시즌으로 자동 배정하지 않는다.
        // 첫 MMR 반영 후 시즌 변경 금지는 서비스에서 검사한다.
        mmrSeasonId: uuid('mmr_season_id'),
        // 웹·봇에서 생성을 요청한 사용자이며, 사용자 삭제 후에도 내전은 보존한다.
        createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        // 클라이언트가 생성 요청 동안 유지하는 식별자다. 같은 실행자의 재시도는 기존 내전을 반환한다.
        creationRequestId: uuid('creation_request_id'),
        revision: integer('revision').default(0).notNull(),
        bracketConfirmedAt: timestamp('bracket_confirmed_at', { withTimezone: true, precision: 3 }),
        bracketConfirmedByUserId: text('bracket_confirmed_by_user_id').references(() => users.id, {
            onDelete: 'set null'
        }),
        title: text('title').notNull(),
        status: scrimStatus('status').default('recruit').notNull(),
        // 운영자가 모집 중·편성 중에 정하거나 바꾼다. 비어 있어도 모집을 마감할 수 있고, 대진 준비부터는 반드시 있다.
        // 편성 중에 바꾸거나 비우면 기존 수동 배정·경매 기록을 무효화한다.
        formationMethod: scrimFormationMethod('formation_method'),
        // 새 Match를 만들 때 사용할 기본값이다. 실제 적용값은 Match에 복사하며 이후 변경을 전파하지 않는다.
        isHardFearless: boolean('is_hard_fearless').default(false).notNull(),
        // 실출전 정원은 팀 수 × 5명이다. 추가 신청 인원은 팀 수나 실출전 정원을 늘리지 않는다.
        teamCount: integer('team_count').default(2).notNull(),
        // 전체 신청 정원은 실출전 정원 + 추가 신청 정원이다. 신청 순서대로 실출전 정원까지 선발하고 나머지는 대기다.
        reserveCapacity: integer('reserve_capacity').default(0).notNull(),
        // 모집 때 안내한 예정 시각이며 실제 경기 시작 시각과 구분한다.
        expectedStartAt: timestamp('expected_start_at', { withTimezone: true, precision: 3 }),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        // 직접 SQL이나 외래키의 SET NULL 동작에는 Drizzle의 자동 갱신이 적용되지 않는다.
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('scrims_id_mmr_season_unique').on(table.id, table.mmrSeasonId),
        unique('scrims_creation_request_unique').on(table.createdByUserId, table.creationRequestId),
        foreignKey({
            name: 'scrims_mmr_season_fk',
            columns: [table.guildId, table.mmrSeasonId],
            foreignColumns: [mmrSeasons.guildId, mmrSeasons.id]
        }).onDelete('restrict'),
        index('scrims_guild_id_idx').on(table.guildId),
        index('scrims_mmr_season_id_idx').on(table.mmrSeasonId),
        index('scrims_created_by_user_id_idx').on(table.createdByUserId),
        check('scrims_team_count_range', sql`${table.teamCount} between 2 and 4`),
        check('scrims_reserve_capacity_range', sql`${table.reserveCapacity} between 0 and 10`),
        check('scrims_revision_nonnegative', sql`${table.revision} >= 0`),
        check('scrims_title_length', sql`length(btrim(${table.title})) between 1 and 50`),
        check(
            'scrims_bracket_confirmer_requires_time',
            sql`${table.bracketConfirmedByUserId} is null or ${table.bracketConfirmedAt} is not null`
        ),
        check(
            'scrims_formation_method_required',
            sql`${table.status} in ('recruit', 'preparing', 'cancelled') or ${table.formationMethod} is not null`
        )
    ]
);

// 경매는 시작 전후에 취소할 수 있으며, 내전 경기의 중도 종료와는 구분한다.
export const auctionStatus = pgEnum('auction_status', ['setup', 'in_progress', 'completed', 'cancelled']);

// 내전 하나에 경매 하나를 연결한다. 준비 단계로 되돌려도 같은 경매와 이력을 유지한다.
// 편성 방식을 경매가 아닌 것으로 바꾸면 cancelled로 두고, 다시 경매를 고르면 같은 행을 setup으로 되돌린다.
// 경매 방식의 Scrim인지와 상태 전환 조건은 서비스에서 검증한다.
export const auctions = pgTable(
    'auctions',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id')
            .notNull()
            .unique()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        status: auctionStatus('status').default('setup').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }),
        endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        // 경매 팀·참가자가 같은 내전에 속하는지 검사할 복합 외래키의 대상이다.
        unique('auctions_scrim_id_id_unique').on(table.scrimId, table.id),
        check('auctions_time_order', sql`${table.endedAt} >= ${table.startedAt}`)
    ]
);

export const scrimTeams = pgTable(
    'scrim_teams',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id')
            .notNull()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        // 팀을 만들 때 정해진 이름 목록(포로팀·칼날부리팀…)에서 순서대로 붙이며 운영자가 따로 입력하지 않는다.
        name: text('name').notNull(),
        // 현재 구성의 팀 순서다. 경매 이력이 있는 팀을 제외할 때는 행 대신 활성 상태를 바꾼다.
        ordinal: integer('ordinal').notNull(),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        // 참가자와 대진에서 같은 내전의 팀만 연결할 수 있도록 복합 외래키의 대상이 된다.
        unique('scrim_teams_scrim_id_id_unique').on(table.scrimId, table.id),
        uniqueIndex('scrim_teams_active_ordinal_unique')
            .on(table.scrimId, table.ordinal)
            .where(sql`${table.isActive}`),
        check('scrim_teams_ordinal_range', sql`${table.ordinal} between 1 and 4`)
    ]
);

// 모집 참가 기록은 길드 탈퇴·사용자 삭제 후에도 보존한다. 경기 시작 후 팀 재편성은 허용하지 않는다.
export const scrimParticipants = pgTable(
    'scrim_participants',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id')
            .notNull()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
        riotAccountId: uuid('riot_account_id').references(() => riotAccounts.id, { onDelete: 'restrict' }),
        // 참가 등록 당시 표시 이름이며, 현재 사용자 프로필에서 과거 이름을 다시 계산하지 않는다.
        displayName: text('display_name').notNull(),
        // 팀 편성에는 활성 신청이 selected인 참가자만 사용한다. 선발 인원수·상태·확정 조건은 서비스에서 검사한다.
        teamId: uuid('team_id'),
        position: lolPosition('position'),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('scrim_participants_scrim_id_id_unique').on(table.scrimId, table.id),
        unique('scrim_participants_user_unique').on(table.scrimId, table.userId),
        unique('scrim_participants_account_unique').on(table.scrimId, table.riotAccountId),
        unique('scrim_participants_team_position_unique').on(table.scrimId, table.teamId, table.position),
        foreignKey({
            name: 'scrim_participants_team_fk',
            columns: [table.scrimId, table.teamId],
            foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
        }).onDelete('restrict'),
        index('scrim_participants_user_id_idx').on(table.userId),
        index('scrim_participants_riot_account_id_idx').on(table.riotAccountId),
        check(
            'scrim_participants_position_requires_team',
            sql`${table.position} is null or ${table.teamId} is not null`
        )
    ]
);

// 경매에 참여하는 팀의 팀장과 시작 예산을 보관한다.
// selected 신청인 팀장만 지정한다. 팀장·예산은 준비(setup) 상태에서만 바꾼다. 진행 중에 바꾸려면 유효 영입을 무효화하고
// 열린 후보를 취소해 준비로 되돌린다. 이 상태 조건과 팀장의 실제 소속은 서비스에서 검사한다.
export const auctionTeams = pgTable(
    'auction_teams',
    {
        scrimId: uuid('scrim_id').notNull(),
        auctionId: uuid('auction_id').notNull(),
        teamId: uuid('team_id').notNull(),
        // 사용자 계정 대신 보존되는 참가 기록을 참조한다.
        captainParticipantId: uuid('captain_participant_id'),
        // 시작 포인트는 명시적으로 지정한다. 잔여 포인트는 이후 유효한 영입 내역에서 계산한다.
        initialPoints: integer('initial_points').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        primaryKey({ columns: [table.auctionId, table.teamId] }),
        unique('auction_teams_scrim_auction_team_unique').on(table.scrimId, table.auctionId, table.teamId),
        unique('auction_teams_captain_unique').on(table.auctionId, table.captainParticipantId),
        // 경매·팀·팀장이 같은 내전에 속하도록 공통 scrimId로 각각 연결한다.
        foreignKey({
            name: 'auction_teams_auction_fk',
            columns: [table.scrimId, table.auctionId],
            foreignColumns: [auctions.scrimId, auctions.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'auction_teams_team_fk',
            columns: [table.scrimId, table.teamId],
            foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'auction_teams_captain_fk',
            columns: [table.scrimId, table.captainParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
        }).onDelete('restrict'),
        index('auction_teams_team_id_idx').on(table.teamId),
        index('auction_teams_captain_participant_id_idx').on(table.captainParticipantId),
        check('auction_teams_initial_points_positive', sql`${table.initialPoints} > 0`)
    ]
);

// 아직 등장하지 않은 후보만 보관한다. 현재 후보는 열린 lot, 영입 결과는 acquisition이 원천이다.
export const auctionQueueEntries = pgTable(
    'auction_queue_entries',
    {
        scrimId: uuid('scrim_id').notNull(),
        auctionId: uuid('auction_id').notNull(),
        scrimParticipantId: uuid('scrim_participant_id').notNull(),
        ordinal: integer('ordinal').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [
        primaryKey({ columns: [table.auctionId, table.scrimParticipantId] }),
        unique('auction_queue_entries_ordinal_unique').on(table.auctionId, table.ordinal),
        foreignKey({
            name: 'auction_queue_entries_auction_fk',
            columns: [table.scrimId, table.auctionId],
            foreignColumns: [auctions.scrimId, auctions.id]
        }).onDelete('cascade'),
        foreignKey({
            name: 'auction_queue_entries_participant_fk',
            columns: [table.scrimId, table.scrimParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
        }).onDelete('restrict'),
        check('auction_queue_entries_ordinal_positive', sql`${table.ordinal} > 0`)
    ]
);

export const auctionLotStatus = pgEnum('auction_lot_status', ['open', 'sold', 'unsold', 'cancelled']);

// 참가자가 경매에 등장한 한 번의 시도다. 유찰 후 재등장·재추첨은 이전 기록을 보존하고 새 행으로 남긴다.
// selected 신청만 후보로 사용하며, 상태 전환과 팀장·이미 영입된 참가자의 후보 제외는 서비스에서 검사한다.
export const auctionLots = pgTable(
    'auction_lots',
    {
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
        // 유찰도 되돌릴 수 있으므로 영입과 별도로 시도 자체의 무효화 근거를 남긴다.
        voidedAt: timestamp('voided_at', { withTimezone: true, precision: 3 }),
        voidedByUserId: text('voided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        voidReason: text('void_reason'),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('auction_lots_sequence_unique').on(table.auctionId, table.sequenceNumber),
        unique('auction_lots_auction_participant_id_unique').on(
            table.auctionId,
            table.scrimParticipantId,
            table.id
        ),
        // 종료된 시도와 재등장은 보존하면서 경매당 현재 후보만 하나로 제한한다.
        uniqueIndex('auction_lots_open_auction_unique')
            .on(table.auctionId)
            .where(sql`${table.status} = 'open'`),
        foreignKey({
            name: 'auction_lots_auction_fk',
            columns: [table.scrimId, table.auctionId],
            foreignColumns: [auctions.scrimId, auctions.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'auction_lots_participant_fk',
            columns: [table.scrimId, table.scrimParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
        }).onDelete('restrict'),
        index('auction_lots_participant_id_idx').on(table.scrimParticipantId),
        check('auction_lots_sequence_positive', sql`${table.sequenceNumber} > 0`),
        check(
            'auction_lots_closed_at_matches_status',
            sql`(${table.status} = 'open' and ${table.closedAt} is null) or (${table.status} <> 'open' and ${table.closedAt} is not null)`
        ),
        check('auction_lots_time_order', sql`${table.closedAt} >= ${table.openedAt}`),
        check(
            'auction_lots_void_details',
            sql`(${table.voidedAt} is null and ${table.voidedByUserId} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.status} <> 'open' and ${table.voidReason} is not null and length(btrim(${table.voidReason})) > 0)`
        ),
        check('auction_lots_void_time', sql`${table.voidedAt} >= ${table.closedAt}`)
    ]
);

export const auctionAcquisitionMethod = pgEnum('auction_acquisition_method', ['auction', 'manual']);

// 낙찰·수동 영입의 원장이다. 실제 구매 팀장과 값을 입력한 운영자를 구분한다.
// 금액·대상·구매자 정정은 이전 행을 무효화하고 새 행으로 연결하며 원래 거래값을 덮어쓰지 않는다.
// 이전 행의 무효 여부·정정 순환·팀장 일치·예산·팀 정원과 팀 배정의 동시 변경은 서비스에서 검사한다.
// 기본 가격 통계는 완료된 경매의 유효 auction 행만 집계한다. 수동 배정과 팀장 편입은 낙찰 건수가 아니다.
export const auctionAcquisitions = pgTable(
    'auction_acquisitions',
    {
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
        supersedesId: uuid('supersedes_id')
    },
    (table) => [
        unique('auction_acquisitions_auction_id_unique').on(table.auctionId, table.id),
        unique('auction_acquisitions_supersedes_unique').on(table.supersedesId),
        uniqueIndex('auction_acquisitions_active_participant_unique')
            .on(table.auctionId, table.scrimParticipantId)
            .where(sql`${table.voidedAt} is null`),
        foreignKey({
            name: 'auction_acquisitions_auction_fk',
            columns: [table.scrimId, table.auctionId],
            foreignColumns: [auctions.scrimId, auctions.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'auction_acquisitions_team_fk',
            columns: [table.scrimId, table.auctionId, table.teamId],
            foreignColumns: [auctionTeams.scrimId, auctionTeams.auctionId, auctionTeams.teamId]
        }).onDelete('restrict'),
        foreignKey({
            name: 'auction_acquisitions_participant_fk',
            columns: [table.scrimId, table.scrimParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'auction_acquisitions_buyer_fk',
            columns: [table.scrimId, table.buyerParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
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
        check(
            'auction_acquisitions_method_values',
            sql`(${table.method} = 'auction' and ${table.price} is not null and ${table.price} >= 0 and ${table.lotId} is not null and ${table.buyerParticipantId} is not null) or (${table.method} = 'manual' and ${table.price} is null and ${table.buyerParticipantId} is null)`
        ),
        check(
            'auction_acquisitions_buyer_not_target',
            sql`${table.buyerParticipantId} is null or ${table.buyerParticipantId} <> ${table.scrimParticipantId}`
        ),
        check(
            'auction_acquisitions_not_self_correction',
            sql`${table.supersedesId} is null or ${table.supersedesId} <> ${table.id}`
        ),
        check(
            'auction_acquisitions_void_details',
            sql`(${table.voidedAt} is null and ${table.voidedByUserId} is null and ${table.voidReason} is null) or (${table.voidedAt} is not null and ${table.voidReason} is not null and length(btrim(${table.voidReason})) > 0)`
        ),
        check('auction_acquisitions_void_time', sql`${table.voidedAt} >= ${table.acquiredAt}`)
    ]
);

export const matchStatus = pgEnum('match_status', [
    'pending',
    'in_progress',
    'completed',
    'ended_early',
    'cancelled'
]);
export const matchTeamSlot = pgEnum('match_team_slot', ['a', 'b']);
export const gameSide = pgEnum('game_side', ['blue', 'red']);
export const gameStatus = pgEnum('game_status', [
    'pending',
    'in_progress',
    'awaiting_result',
    'completed',
    'cancelled'
]);
export const replayResultStatus = pgEnum('replay_result_status', ['consistent', 'incomplete', 'conflicting']);

// V1의 저장 계약을 고정한다. 이후 파서 규약이 바뀌면 새 하위 모델을 추가하고 기존 V1은 유지한다.
export type RoflStatsV1 = Record<
    | 'kills'
    | 'deaths'
    | 'assists'
    | 'minionsKilled'
    | 'neutralMinionsKilled'
    | 'damageDealtToChampions'
    | 'damageTaken'
    | 'goldEarned'
    | 'visionScore'
    | 'wardsPlaced'
    | 'wardsKilled'
    | 'controlWardsBought'
    | 'level'
    | 'physicalDamageDealtToChampions'
    | 'magicDamageDealtToChampions'
    | 'trueDamageDealtToChampions'
    | 'physicalDamageTaken'
    | 'magicDamageTaken'
    | 'trueDamageTaken'
    | 'totalHeal'
    | 'healOnTeammates'
    | 'damageShieldedOnTeammates'
    | 'timeCcingOthers'
    | 'totalTimeCrowdControlDealt'
    | 'totalTimeCrowdControlDealtToChampions'
    | 'totalTimeSpentDead'
    | 'doubleKills'
    | 'tripleKills'
    | 'quadraKills'
    | 'pentaKills'
    | 'killingSprees'
    | 'largestKillingSpree'
    | 'largestMultiKill',
    number | null
>;

export interface RoflLoadoutV1 {
    itemIds: [
        number | null,
        number | null,
        number | null,
        number | null,
        number | null,
        number | null,
        number | null
    ];
    summonerSpellIds: [number | null, number | null];
    primaryRuneStyleId: number | null;
    secondaryRuneStyleId: number | null;
    runeIds: [number | null, number | null, number | null, number | null, number | null, number | null];
    statRuneIds: [number | null, number | null, number | null];
}

// 업로드 입력에서 필요한 값만 추출한다. 원본 파일·전체 메타데이터·패킷 덤프·보관 경로는 저장하지 않는다.
// 공통 메타는 한 번의 파싱 결과를 식별하며, 실제 데이터는 projectionVersion에 맞는 하위 모델에 저장한다.
// 메타와 해당 버전의 모든 하위 데이터는 한 트랜잭션에서 저장하며, 채택한 결과는 덮어쓰지 않는다.
export const roflMetadata = pgTable(
    'rofl_metadata',
    {
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
    },
    (table) => [
        unique('rofl_metadata_file_projection_unique').on(table.fileSha256, table.projectionVersion),
        unique('rofl_metadata_id_projection_unique').on(table.id, table.projectionVersion),
        index('rofl_metadata_uploaded_by_user_id_idx').on(table.uploadedByUserId),
        check('rofl_metadata_sha256_format', sql`${table.fileSha256} ~ '^[0-9a-f]{64}$'`),
        check('rofl_metadata_size_safe_positive', sql`${table.fileSizeBytes} between 1 and 9007199254740991`),
        check('rofl_metadata_format_positive', sql`${table.formatVersion} > 0`),
        check('rofl_metadata_projection_positive', sql`${table.projectionVersion} > 0`)
    ]
);

// 버전이 달라져도 운영 경기에서 참가자를 참조하는 키는 유지한다. 버전별 세부 데이터는 아래에 분리한다.
export const roflParticipants = pgTable(
    'rofl_participants',
    {
        roflMetadataId: uuid('rofl_metadata_id')
            .notNull()
            .references(() => roflMetadata.id, { onDelete: 'restrict' }),
        participantIndex: integer('participant_index').notNull()
    },
    (table) => [
        primaryKey({ columns: [table.roflMetadataId, table.participantIndex] }),
        check('rofl_participants_index_nonnegative', sql`${table.participantIndex} >= 0`)
    ]
);

export const roflGameDataV1 = pgTable(
    'rofl_game_data_v1',
    {
        roflMetadataId: uuid('rofl_metadata_id').primaryKey(),
        projectionVersion: integer('projection_version').default(1).notNull(),
        gameLengthMs: bigint('game_length_ms', { mode: 'number' }).notNull(),
        // 메타데이터 일관성만 나타낸다. 등록 권한·참가자 연결·중복 여부는 저장 단계에서 별도로 검증한다.
        resultStatus: replayResultStatus('result_status').notNull(),
        winnerReplayTeamId: bigint('winner_replay_team_id', { mode: 'number' }),
        // ROFL의 팀 번호와 승패만 저장하며 서비스의 팀 ID로 추정하지 않는다.
        teams: jsonb('teams').$type<{ teamId: number; win: boolean | null }[]>().notNull()
    },
    (table) => [
        foreignKey({
            name: 'rofl_game_data_v1_metadata_fk',
            columns: [table.roflMetadataId, table.projectionVersion],
            foreignColumns: [roflMetadata.id, roflMetadata.projectionVersion]
        }).onDelete('restrict'),
        check('rofl_game_data_v1_projection', sql`${table.projectionVersion} = 1`),
        check('rofl_game_data_v1_length_safe', sql`${table.gameLengthMs} between 0 and 9007199254740991`),
        check(
            'rofl_game_data_v1_winner_safe',
            sql`${table.winnerReplayTeamId} between 0 and 9007199254740991`
        ),
        check(
            'rofl_game_data_v1_winner_consistency',
            sql`(${table.resultStatus} = 'consistent' and ${table.winnerReplayTeamId} is not null) or (${table.resultStatus} <> 'consistent' and ${table.winnerReplayTeamId} is null)`
        )
    ]
);

export const roflParticipantDataV1 = pgTable(
    'rofl_participant_data_v1',
    {
        roflMetadataId: uuid('rofl_metadata_id')
            .notNull()
            .references(() => roflGameDataV1.roflMetadataId, { onDelete: 'restrict' }),
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
    },
    (table) => [
        primaryKey({ columns: [table.roflMetadataId, table.participantIndex] }),
        foreignKey({
            name: 'rofl_participant_data_v1_participant_fk',
            columns: [table.roflMetadataId, table.participantIndex],
            foreignColumns: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
        }).onDelete('restrict'),
        check('rofl_participant_data_v1_team_safe', sql`${table.replayTeamId} between 0 and 9007199254740991`)
    ]
);

// Match는 두 팀의 시리즈다. 점수는 completed 상태인 Game에서 집계하며 별도로 중복 저장하지 않는다.
// Game 생성 후 A/B 팀 변경 금지와 경기 시작 후 bestOf·피어리스 변경 금지는 서비스에서 검사한다.
export const matches = pgTable(
    'matches',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id')
            .notNull()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        // A/B는 시리즈의 고정 팀 구분이다. 각 Game의 블루/레드 진영과는 별개다.
        teamAId: uuid('team_a_id').notNull(),
        teamBId: uuid('team_b_id').notNull(),
        label: text('label'),
        bestOf: integer('best_of').notNull(),
        // Scrim 기본값을 생성 시 명시적으로 저장한다. 안내 기준은 이 Match의 이전 Game에서 양 팀이 사용한 픽이다.
        // 피어리스 위반은 안내로 처리하며 ROFL 업로드나 경기 결과 등록을 막지 않는다.
        isHardFearless: boolean('is_hard_fearless').notNull(),
        revision: integer('revision').default(0).notNull(),
        status: matchStatus('status').default('pending').notNull(),
        // 정상 종료에만 시리즈 승자를 기록한다. 1:0·1:1 중도 종료에는 승자를 만들지 않는다.
        winnerTeamId: uuid('winner_team_id'),
        startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }),
        endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }),
        endReason: text('end_reason'),
        // 내전 중도 종료가 멈춘 경기만 재개한다. 이전 종료 정보도 함께 보존한다.
        statusBeforeScrimEnd: matchStatus('status_before_scrim_end'),
        endedAtBeforeScrimEnd: timestamp('ended_at_before_scrim_end', { withTimezone: true, precision: 3 }),
        endReasonBeforeScrimEnd: text('end_reason_before_scrim_end'),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('matches_scrim_id_id_unique').on(table.scrimId, table.id),
        foreignKey({
            name: 'matches_team_a_fk',
            columns: [table.scrimId, table.teamAId],
            foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'matches_team_b_fk',
            columns: [table.scrimId, table.teamBId],
            foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
        }).onDelete('restrict'),
        index('matches_team_a_id_idx').on(table.teamAId),
        index('matches_team_b_id_idx').on(table.teamBId),
        check('matches_distinct_teams', sql`${table.teamAId} <> ${table.teamBId}`),
        check('matches_best_of_allowed', sql`${table.bestOf} in (1, 3, 5)`),
        check('matches_revision_nonnegative', sql`${table.revision} >= 0`),
        check(
            'matches_winner_is_competing_team',
            sql`${table.winnerTeamId} is null or ${table.winnerTeamId} in (${table.teamAId}, ${table.teamBId})`
        ),
        check(
            'matches_winner_requires_completion',
            sql`(${table.status} = 'completed' and ${table.winnerTeamId} is not null) or (${table.status} <> 'completed' and ${table.winnerTeamId} is null)`
        ),
        check('matches_time_order', sql`${table.endedAt} >= ${table.startedAt}`),
        check(
            'matches_scrim_end_restore_state',
            sql`(${table.statusBeforeScrimEnd} is null and ${table.endedAtBeforeScrimEnd} is null and ${table.endReasonBeforeScrimEnd} is null) or (${table.statusBeforeScrimEnd} is not null and ((${table.statusBeforeScrimEnd} = 'pending' and ${table.status} = 'cancelled') or (${table.statusBeforeScrimEnd} = 'in_progress' and ${table.status} = 'ended_early')))`
        )
    ]
);

// 경기 전체의 출전 계획이다. 수동 편성의 확정 포지션은 복사하고, 경매는 경기별 한 번 확정한다.
export const matchLineups = pgTable(
    'match_lineups',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id').notNull(),
        matchId: uuid('match_id').notNull(),
        confirmedAt: timestamp('confirmed_at', { withTimezone: true, precision: 3 }),
        confirmedByUserId: text('confirmed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('match_lineups_match_unique').on(table.matchId),
        unique('match_lineups_scrim_id_unique').on(table.scrimId, table.id),
        unique('match_lineups_match_id_unique').on(table.matchId, table.id),
        foreignKey({
            columns: [table.scrimId, table.matchId],
            foreignColumns: [matches.scrimId, matches.id],
            name: 'match_lineups_match_fk'
        }).onDelete('restrict'),
        check(
            'match_lineups_confirmation_valid',
            sql`${table.confirmedAt} is not null or ${table.confirmedByUserId} is null`
        )
    ]
);

export const matchLineupPlayers = pgTable(
    'match_lineup_players',
    {
        scrimId: uuid('scrim_id').notNull(),
        lineupId: uuid('lineup_id').notNull(),
        participantId: uuid('participant_id').notNull(),
        teamId: uuid('team_id').notNull(),
        position: lolPosition('position').notNull()
    },
    (table) => [
        primaryKey({ columns: [table.lineupId, table.participantId] }),
        unique('match_lineup_players_team_position_unique').on(table.lineupId, table.teamId, table.position),
        foreignKey({
            columns: [table.scrimId, table.lineupId],
            foreignColumns: [matchLineups.scrimId, matchLineups.id],
            name: 'match_lineup_players_lineup_fk'
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.scrimId, table.participantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id],
            name: 'match_lineup_players_participant_fk'
        }).onDelete('restrict'),
        foreignKey({
            columns: [table.scrimId, table.teamId],
            foreignColumns: [scrimTeams.scrimId, scrimTeams.id],
            name: 'match_lineup_players_team_fk'
        }).onDelete('restrict')
    ]
);

// scrimId는 같은 내전의 Game·참가자만 연결하도록 복합 외래키에 사용한다.
export const games = pgTable(
    'games',
    {
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
        // 정정은 기존 Game·출전·메타를 남겨 취소하고, 새 결과를 별도 Game으로 등록한다.
        roflMetadataId: uuid('rofl_metadata_id')
            .unique()
            .references(() => roflMetadata.id, { onDelete: 'restrict' }),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        uniqueIndex('games_match_number_unique')
            .on(table.matchId, table.gameNumber)
            .where(sql`${table.status} <> 'cancelled'`),
        unique('games_scrim_id_id_unique').on(table.scrimId, table.id),
        unique('games_match_id_id_unique').on(table.matchId, table.id),
        unique('games_id_rofl_metadata_unique').on(table.id, table.roflMetadataId),
        foreignKey({
            name: 'games_match_fk',
            columns: [table.scrimId, table.matchId],
            foreignColumns: [matches.scrimId, matches.id]
        }).onDelete('restrict'),
        check('games_number_positive', sql`${table.gameNumber} > 0`),
        check(
            'games_completed_requires_rofl',
            sql`${table.status} <> 'completed' or ${table.roflMetadataId} is not null`
        ),
        check(
            'games_winner_requires_completion',
            sql`(${table.status} = 'completed' and ${table.winnerSide} is not null) or (${table.status} <> 'completed' and ${table.winnerSide} is null)`
        ),
        check('games_time_order', sql`${table.endedAt} >= ${table.startedAt}`)
    ]
);

// 원본 파일 대신 검증된 결과 지문과 당시 요청 슬롯을 보존한다. 취소 후 재전송이 결과를 되살리지 않는다.
export const matchRoflImports = pgTable(
    'match_rofl_imports',
    {
        roflMetadataId: uuid('rofl_metadata_id')
            .primaryKey()
            .references(() => roflMetadata.id, { onDelete: 'restrict' }),
        resultFingerprint: text('result_fingerprint').notNull().unique(),
        matchId: uuid('match_id')
            .notNull()
            .references(() => matches.id, { onDelete: 'restrict' }),
        gameId: uuid('game_id').notNull(),
        lineupId: uuid('lineup_id').notNull(),
        submittedRevision: integer('submitted_revision').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [
        foreignKey({
            columns: [table.matchId, table.lineupId],
            foreignColumns: [matchLineups.matchId, matchLineups.id],
            name: 'match_rofl_imports_lineup_fk'
        }).onDelete('restrict'),
        foreignKey({
            columns: [table.matchId, table.gameId],
            foreignColumns: [games.matchId, games.id],
            name: 'match_rofl_imports_game_fk'
        }).onDelete('restrict'),
        foreignKey({
            columns: [table.gameId, table.roflMetadataId],
            foreignColumns: [games.id, games.roflMetadataId],
            name: 'match_rofl_imports_selected_rofl_fk'
        }).onDelete('restrict'),
        check('match_rofl_imports_fingerprint_valid', sql`${table.resultFingerprint} ~ '^[0-9a-f]{64}$'`),
        check('match_rofl_imports_revision_nonnegative', sql`${table.submittedRevision} >= 0`)
    ]
);

// 실제 한 판의 출전 기록이다. 미연결 ROFL 참가자의 선별 데이터는 버전별 ROFL 하위 모델에 남긴다.
// selected 신청·팀 소속·실제 사용 계정·5인 라인업·Game 순번과 시리즈 종료 조건은 저장 시 서비스에서 검사한다.
export const gameParticipants = pgTable(
    'game_participants',
    {
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
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        primaryKey({ columns: [table.gameId, table.scrimParticipantId] }),
        unique('game_participants_account_unique').on(table.gameId, table.riotAccountId),
        unique('game_participants_side_position_unique').on(table.gameId, table.side, table.position),
        unique('game_participants_rofl_index_unique').on(table.gameId, table.roflParticipantIndex),
        foreignKey({
            name: 'game_participants_game_fk',
            columns: [table.scrimId, table.gameId],
            foreignColumns: [games.scrimId, games.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'game_participants_participant_fk',
            columns: [table.scrimId, table.scrimParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'game_participants_selected_rofl_fk',
            columns: [table.gameId, table.roflMetadataId],
            foreignColumns: [games.id, games.roflMetadataId]
        }).onDelete('restrict'),
        foreignKey({
            name: 'game_participants_rofl_participant_fk',
            columns: [table.roflMetadataId, table.roflParticipantIndex],
            foreignColumns: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
        }).onDelete('restrict'),
        index('game_participants_participant_id_idx').on(table.scrimParticipantId),
        index('game_participants_riot_account_id_idx').on(table.riotAccountId),
        index('game_participants_rofl_participant_idx').on(table.roflMetadataId, table.roflParticipantIndex),
        check('game_participants_champion_id_positive', sql`${table.championId} > 0`)
    ]
);

// 정상 결과는 Game·출전자·원장·현재 점수를 같은 트랜잭션으로 갱신한다. 채택 ROFL·실출전·동포지션 상대의 일치는 서비스에서 검사한다.
export const gameMmrApplications = pgTable(
    'game_mmr_applications',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id').notNull(),
        gameId: uuid('game_id').notNull(),
        seasonId: uuid('season_id').notNull(),
        // 당시 계산 근거와 역분개 이력을 보존한다. 정정한 새 결과는 새 Game의 별도 반영으로 기록한다.
        roflMetadataId: uuid('rofl_metadata_id')
            .notNull()
            .references(() => roflMetadata.id, { onDelete: 'restrict' }),
        revision: integer('revision').notNull(),
        appliedAt: timestamp('applied_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        appliedByUserId: text('applied_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        reversedAt: timestamp('reversed_at', { withTimezone: true, precision: 3 }),
        reversedByUserId: text('reversed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        reversalReason: text('reversal_reason')
    },
    (table) => [
        unique('game_mmr_applications_game_revision_unique').on(table.gameId, table.revision),
        unique('game_mmr_applications_season_scrim_id_unique').on(table.seasonId, table.scrimId, table.id),
        uniqueIndex('game_mmr_applications_active_game_unique')
            .on(table.gameId)
            .where(sql`${table.reversedAt} is null`),
        foreignKey({
            name: 'game_mmr_applications_game_fk',
            columns: [table.scrimId, table.gameId],
            foreignColumns: [games.scrimId, games.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'game_mmr_applications_scrim_season_fk',
            columns: [table.scrimId, table.seasonId],
            foreignColumns: [scrims.id, scrims.mmrSeasonId]
        }).onDelete('restrict'),
        index('game_mmr_applications_rofl_metadata_idx').on(table.roflMetadataId),
        index('game_mmr_applications_applied_by_idx').on(table.appliedByUserId),
        index('game_mmr_applications_reversed_by_idx').on(table.reversedByUserId),
        check('game_mmr_applications_revision_positive', sql`${table.revision} > 0`),
        check('game_mmr_applications_time_order', sql`${table.reversedAt} >= ${table.appliedAt}`),
        check(
            'game_mmr_applications_reversal_details',
            sql`
		(${table.reversedAt} is null and ${table.reversedByUserId} is null and ${table.reversalReason} is null)
		or (${table.reversedAt} is not null and nullif(btrim(${table.reversalReason}), '') is not null)
	`
        )
    ]
);

export const mmrLedgerEntryKind = pgEnum('mmr_ledger_entry_kind', [
    'game_result',
    'game_reversal',
    'adjustment'
]);

// 원장 수치는 덮어쓰지 않는다. 증감은 afterMmr - beforeMmr로 계산하고 취소는 별도 역분개 행으로 남긴다.
// ROFL 교체 시 재생성되는 gameParticipants 대신 보존되는 참가자와 반영 회차를 참조한다.
// 이전·이후 점수의 연결, 현재 점수·revision과의 일치, 실제 사용자·포지션 및 역분개 가능 순서는 서비스에서 검증한다.
export const mmrLedgerEntries = pgTable(
    'mmr_ledger_entries',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        seasonId: uuid('season_id').notNull(),
        ratingId: uuid('rating_id').notNull(),
        revision: integer('revision').notNull(),
        kind: mmrLedgerEntryKind('kind').notNull(),
        applicationId: uuid('application_id'),
        scrimId: uuid('scrim_id'),
        scrimParticipantId: uuid('scrim_participant_id'),
        beforeMmr: doublePrecision('before_mmr').notNull(),
        afterMmr: doublePrecision('after_mmr').notNull(),
        reversesEntryId: uuid('reverses_entry_id'),
        reason: text('reason'),
        recordedByUserId: text('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [
        unique('mmr_ledger_entries_rating_revision_unique').on(table.ratingId, table.revision),
        unique('mmr_ledger_entries_app_rating_kind_unique').on(
            table.applicationId,
            table.ratingId,
            table.kind
        ),
        unique('mmr_ledger_entries_app_participant_kind_unique').on(
            table.applicationId,
            table.scrimParticipantId,
            table.kind
        ),
        unique('mmr_ledger_entries_reversal_source_unique').on(
            table.ratingId,
            table.applicationId,
            table.scrimParticipantId,
            table.id
        ),
        unique('mmr_ledger_entries_reverses_entry_unique').on(table.reversesEntryId),
        foreignKey({
            name: 'mmr_ledger_entries_rating_fk',
            columns: [table.seasonId, table.ratingId],
            foreignColumns: [userPositionMmr.seasonId, userPositionMmr.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'mmr_ledger_entries_application_fk',
            columns: [table.seasonId, table.scrimId, table.applicationId],
            foreignColumns: [
                gameMmrApplications.seasonId,
                gameMmrApplications.scrimId,
                gameMmrApplications.id
            ]
        }).onDelete('restrict'),
        foreignKey({
            name: 'mmr_ledger_entries_participant_fk',
            columns: [table.scrimId, table.scrimParticipantId],
            foreignColumns: [scrimParticipants.scrimId, scrimParticipants.id]
        }).onDelete('restrict'),
        // 역분개는 동일 MMR·반영 회차·참가자의 원장만 가리킬 수 있다.
        foreignKey({
            name: 'mmr_ledger_entries_reversal_fk',
            columns: [table.ratingId, table.applicationId, table.scrimParticipantId, table.reversesEntryId],
            foreignColumns: [table.ratingId, table.applicationId, table.scrimParticipantId, table.id]
        }).onDelete('restrict'),
        index('mmr_ledger_entries_participant_idx').on(table.scrimParticipantId),
        index('mmr_ledger_entries_recorded_by_idx').on(table.recordedByUserId),
        check('mmr_ledger_entries_revision_positive', sql`${table.revision} > 0`),
        check(
            'mmr_ledger_entries_values_finite',
            sql`
		${table.beforeMmr} > '-Infinity'::double precision and ${table.beforeMmr} < 'Infinity'::double precision
		and ${table.afterMmr} > '-Infinity'::double precision and ${table.afterMmr} < 'Infinity'::double precision
	`
        ),
        check('mmr_ledger_entries_no_self_reversal', sql`${table.reversesEntryId} <> ${table.id}`),
        check(
            'mmr_ledger_entries_kind_details',
            sql`
		(${table.kind} = 'adjustment' and ${table.applicationId} is null and ${table.scrimId} is null
			and ${table.scrimParticipantId} is null and ${table.reversesEntryId} is null
			and nullif(btrim(${table.reason}), '') is not null)
		or (${table.kind} = 'game_result' and ${table.applicationId} is not null and ${table.scrimId} is not null
			and ${table.scrimParticipantId} is not null and ${table.reversesEntryId} is null)
		or (${table.kind} = 'game_reversal' and ${table.applicationId} is not null and ${table.scrimId} is not null
			and ${table.scrimParticipantId} is not null and ${table.reversesEntryId} is not null
			and nullif(btrim(${table.reason}), '') is not null)
	`
        )
    ]
);

// 단일 결승 또는 준결승·결승의 BO 규칙이다. 운영자가 대진 화면에서 정하고, Match 생성 시 해당 규칙을 복사한다.
// Match 생성 후 라운드 규칙 변경은 서비스에서 제한한다.
export const scrimRounds = pgTable(
    'scrim_rounds',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id')
            .notNull()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        roundNumber: integer('round_number').notNull(),
        label: text('label').notNull(),
        bestOf: integer('best_of').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('scrim_rounds_scrim_id_id_unique').on(table.scrimId, table.id),
        unique('scrim_rounds_number_unique').on(table.scrimId, table.roundNumber),
        check('scrim_rounds_number_positive', sql`${table.roundNumber} > 0`),
        check('scrim_rounds_best_of_allowed', sql`${table.bestOf} in (1, 3, 5)`)
    ]
);

// 대진표의 계획 경기다. 양 팀이 결정되면 실제 Match를 만들고 연결하며, 팀 미정 결승도 미리 보관할 수 있다.
// 라운드 진행 순서·순환 참조·슬롯과 실제 Match 팀의 일치 및 확정 후 변경 제한은 서비스에서 검사한다.
export const scrimBracketNodes = pgTable(
    'scrim_bracket_nodes',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id').notNull(),
        roundId: uuid('round_id').notNull(),
        matchNumber: integer('match_number').notNull(),
        matchId: uuid('match_id').unique(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('scrim_bracket_nodes_scrim_id_id_unique').on(table.scrimId, table.id),
        unique('scrim_bracket_nodes_number_unique').on(table.roundId, table.matchNumber),
        foreignKey({
            name: 'scrim_bracket_nodes_round_fk',
            columns: [table.scrimId, table.roundId],
            foreignColumns: [scrimRounds.scrimId, scrimRounds.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'scrim_bracket_nodes_match_fk',
            columns: [table.scrimId, table.matchId],
            foreignColumns: [matches.scrimId, matches.id]
        }).onDelete('restrict'),
        check('scrim_bracket_nodes_number_positive', sql`${table.matchNumber} > 0`)
    ]
);

// A/B 자리마다 직접 배정한 팀 또는 이전 대진의 승자를 지정한다. 둘 다 null이면 아직 미정인 자리다.
// sourceNodeId는 승자 진출만 뜻한다. 중도 종료처럼 승자가 없는 경기를 임의로 진출시키지 않는다.
// 승자가 정해져도 진출 원본 연결은 유지하고, 실제 대진 팀은 연결된 Match에 기록한다.
export const scrimBracketSlots = pgTable(
    'scrim_bracket_slots',
    {
        scrimId: uuid('scrim_id').notNull(),
        nodeId: uuid('node_id').notNull(),
        slot: matchTeamSlot('slot').notNull(),
        teamId: uuid('team_id'),
        sourceNodeId: uuid('source_node_id'),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        primaryKey({ columns: [table.nodeId, table.slot] }),
        unique('scrim_bracket_slots_team_unique').on(table.scrimId, table.teamId),
        // 한 경기의 승자가 대진표의 여러 자리로 동시에 진출하지 않도록 한다.
        unique('scrim_bracket_slots_source_unique').on(table.sourceNodeId),
        foreignKey({
            name: 'scrim_bracket_slots_node_fk',
            columns: [table.scrimId, table.nodeId],
            foreignColumns: [scrimBracketNodes.scrimId, scrimBracketNodes.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'scrim_bracket_slots_team_fk',
            columns: [table.scrimId, table.teamId],
            foreignColumns: [scrimTeams.scrimId, scrimTeams.id]
        }).onDelete('restrict'),
        foreignKey({
            name: 'scrim_bracket_slots_source_fk',
            columns: [table.scrimId, table.sourceNodeId],
            foreignColumns: [scrimBracketNodes.scrimId, scrimBracketNodes.id]
        }).onDelete('restrict'),
        index('scrim_bracket_slots_team_id_idx').on(table.teamId),
        check(
            'scrim_bracket_slots_source_exclusive',
            sql`${table.teamId} is null or ${table.sourceNodeId} is null`
        ),
        check('scrim_bracket_slots_not_self', sql`${table.sourceNodeId} <> ${table.nodeId}`)
    ]
);

// 서버 관리에서 고르는 Discord 연동 설정이다. 선택지는 봇이 동기화한 역할·채널 목록이며, 저장할 때 목록에 있는지와 봇의 게시 권한을 확인한다.
export const guildDiscordSettings = pgTable('guild_discord_settings', {
    guildId: text('guild_id')
        .primaryKey()
        .references(() => guilds.id, { onDelete: 'cascade' }),
    // 이 역할을 가진 멤버가 서버 관리자다. 비어 있으면 Discord 서버 관리 권한이 있는 멤버만 관리자다.
    operatorRoleId: text('operator_role_id'),
    recruitmentChannelId: text('recruitment_channel_id'),
    // 팀 편성이 확정되면 팀 구성을 올려 밸런스를 확인하는 채널이다.
    entryChannelId: text('entry_channel_id'),
    resultChannelId: text('result_channel_id'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date())
});

// 봇이 Discord에서 동기화하는 역할 목록이다. @everyone과 봇 관리 역할은 넣지 않는다. Discord에서 지워지면 행도 지운다.
export const guildDiscordRoles = pgTable(
    'guild_discord_roles',
    {
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'cascade' }),
        roleId: text('role_id').notNull(),
        name: text('name').notNull(),
        // Discord 역할 순서. 선택지는 높은 역할부터 보여 준다.
        position: integer('position').notNull(),
        syncedAt: timestamp('synced_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [primaryKey({ columns: [table.guildId, table.roleId] })]
);

// 봇이 Discord에서 동기화하는 글 채널 목록이다. 게시 권한은 동기화 시점 기준이며 실제 게시 실패는 따로 처리한다.
export const guildDiscordChannels = pgTable(
    'guild_discord_channels',
    {
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'cascade' }),
        channelId: text('channel_id').notNull(),
        name: text('name').notNull(),
        categoryName: text('category_name'),
        position: integer('position').notNull(),
        botCanPost: boolean('bot_can_post').notNull(),
        syncedAt: timestamp('synced_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [primaryKey({ columns: [table.guildId, table.channelId] })]
);

// 내전·게시 종류마다 현재 Discord 글 하나를 유지한다.
export const scrimDiscordMessages = pgTable(
    'scrim_discord_messages',
    {
        scrimId: uuid('scrim_id')
            .notNull()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        kind: text('kind')
            .$type<'recruitment' | 'entry' | 'lineup' | 'result' | 'confirmation_dm'>()
            .default('recruitment')
            .notNull(),
        subjectId: text('subject_id').default('scrim').notNull(),
        channelId: text('channel_id').notNull(),
        messageId: text('message_id').notNull().unique(),
        publishedRevision: integer('published_revision').default(0).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        primaryKey({ columns: [table.scrimId, table.kind, table.subjectId] }),
        check(
            'scrim_discord_messages_kind_valid',
            sql`${table.kind} in ('recruitment', 'entry', 'lineup', 'result', 'confirmation_dm')`
        ),
        check('scrim_discord_messages_revision_nonnegative', sql`${table.publishedRevision} >= 0`)
    ]
);

// 게시할 최신 상태를 업무 저장과 함께 기록한다. Discord 전송 동안 DB 잠금을 유지하지 않는다.
export const discordPublicationJobs = pgTable(
    'discord_publication_jobs',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimId: uuid('scrim_id')
            .notNull()
            .references(() => scrims.id, { onDelete: 'restrict' }),
        kind: text('kind')
            .$type<'recruitment' | 'entry' | 'lineup' | 'result' | 'confirmation_dm'>()
            .notNull(),
        subjectId: text('subject_id').default('scrim').notNull(),
        revision: integer('revision').default(1).notNull(),
        status: text('status')
            .$type<'pending' | 'processing' | 'sent' | 'blocked' | 'uncertain'>()
            .default('pending')
            .notNull(),
        attempts: integer('attempts').default(0).notNull(),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull(),
        nonce: text('nonce').notNull(),
        leaseToken: uuid('lease_token'),
        leaseUntil: timestamp('lease_until', { withTimezone: true, precision: 3 }),
        leaseRevision: integer('lease_revision'),
        leaseChannelId: text('lease_channel_id'),
        leaseMessageId: text('lease_message_id'),
        leaseOperation: text('lease_operation').$type<'upsert' | 'delete'>(),
        errorCode: text('error_code'),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
            .defaultNow()
            .notNull()
            .$onUpdate(() => new Date())
    },
    (table) => [
        unique('discord_publication_jobs_scrim_kind_unique').on(table.scrimId, table.kind, table.subjectId),
        index('discord_publication_jobs_pending_idx').on(table.status, table.nextAttemptAt),
        check(
            'discord_publication_jobs_kind_valid',
            sql`${table.kind} in ('recruitment', 'entry', 'lineup', 'result', 'confirmation_dm')`
        ),
        check(
            'discord_publication_jobs_status_valid',
            sql`${table.status} in ('pending', 'processing', 'sent', 'blocked', 'uncertain')`
        ),
        check('discord_publication_jobs_counts_valid', sql`${table.revision} > 0 and ${table.attempts} >= 0`),
        check(
            'discord_publication_jobs_lease_complete',
            sql`${table.status} <> 'processing' or (${table.leaseToken} is not null and ${table.leaseUntil} is not null and ${table.leaseRevision} is not null and (${table.leaseChannelId} is not null or ${table.kind} = 'confirmation_dm') and ${table.leaseOperation} is not null and ${table.leaseOperation} in ('upsert', 'delete'))`
        )
    ]
);

// interaction 토큰 대신 요청 식별자·내용 해시·업무 결과만 저장한다.
export const discordInteractionReceipts = pgTable(
    'discord_interaction_receipts',
    {
        interactionId: text('interaction_id').primaryKey(),
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.id, { onDelete: 'restrict' }),
        actorId: text('actor_id').notNull(),
        requestHash: text('request_hash').notNull(),
        result: jsonb('result').$type<unknown>(),
        createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
    },
    (table) => [check('discord_interaction_receipts_hash_valid', sql`length(${table.requestHash}) = 64`)]
);

// 신청 시 희망 포지션과 우선순위다. 실제 배정 포지션은 scrimParticipants.position에 보관한다.
export const scrimParticipantPreferences = pgTable(
    'scrim_participant_preferences',
    {
        scrimParticipantId: uuid('scrim_participant_id')
            .notNull()
            .references(() => scrimParticipants.id, { onDelete: 'restrict' }),
        position: lolPosition('position').notNull(),
        priority: integer('priority').notNull()
    },
    (table) => [
        primaryKey({ columns: [table.scrimParticipantId, table.position] }),
        unique('scrim_participant_preferences_priority_unique').on(table.scrimParticipantId, table.priority),
        check('scrim_participant_preferences_priority_range', sql`${table.priority} between 1 and 5`)
    ]
);

// 신청하면 선발 정원이 남아 있을 때 선발, 찼으면 대기가 된다. 자진 철회·운영자 제외는 신청을 마감한다.
export const scrimRegistrationStatus = pgEnum('scrim_registration_status', [
    'selected',
    'standby',
    'withdrawn',
    'excluded'
]);

// 참가자 ID는 유지하고 신청마다 새 행을 만든다. 철회·제외한 행을 재사용하지 않아 재신청 이력이 남는다.
// withdrawnAt이 없는 신청이 현재 정원에 포함된다. 선발 수는 팀 수 × 5명, 활성 신청 수는 여기에 reserveCapacity를 더한 값으로 제한한다.
// 정원 검사·자동 선발·선발자 철회/제외 시 가장 먼저 신청한 대기자 승급·시작 후 제외 제한·미확정 팀 배정 정리는 서비스 트랜잭션에서 처리한다.
export const scrimParticipantRegistrations = pgTable(
    'scrim_participant_registrations',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        scrimParticipantId: uuid('scrim_participant_id')
            .notNull()
            .references(() => scrimParticipants.id, { onDelete: 'restrict' }),
        status: scrimRegistrationStatus('status').notNull(),
        joinedAt: timestamp('joined_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
        joinedByUserId: text('joined_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        // 자진 철회와 운영자 제외 모두 신청을 마감하며, 행위자·사유를 남기고 참가자 행은 삭제하지 않는다.
        withdrawnAt: timestamp('withdrawn_at', { withTimezone: true, precision: 3 }),
        withdrawnByUserId: text('withdrawn_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        withdrawalReason: text('withdrawal_reason')
    },
    (table) => [
        uniqueIndex('scrim_participant_registrations_active_unique')
            .on(table.scrimParticipantId)
            .where(sql`${table.withdrawnAt} is null`),
        index('scrim_participant_registrations_history_idx').on(table.scrimParticipantId, table.joinedAt),
        index('scrim_participant_registrations_joined_by_idx').on(table.joinedByUserId),
        index('scrim_participant_registrations_withdrawn_by_idx').on(table.withdrawnByUserId),
        check('scrim_participant_registrations_time_order', sql`${table.withdrawnAt} >= ${table.joinedAt}`),
        check(
            'scrim_participant_registrations_status_closure',
            sql`(${table.status} in ('withdrawn', 'excluded')) = (${table.withdrawnAt} is not null)`
        ),
        check(
            'scrim_participant_registrations_withdrawal_details',
            sql`${table.withdrawnAt} is not null or (${table.withdrawnByUserId} is null and ${table.withdrawalReason} is null)`
        )
    ]
);

// 조회용 관계와 위의 DB 외래키 제약을 함께 유지한다.
export const usersRelations = relations(users, ({ one, many }) => ({
    sessions: many(sessions),
    memberships: many(guildMembers),
    riotAccounts: many(guildRiotAccounts, { relationName: 'riotAccountOwner' }),
    linkedRiotAccounts: many(guildRiotAccounts, { relationName: 'riotAccountLinker' }),
    createdScrims: many(scrims, { relationName: 'scrimCreator' }),
    confirmedBrackets: many(scrims, { relationName: 'bracketConfirmer' }),
    voidedAuctionLots: many(auctionLots),
    championPreferences: many(userChampionPreferences),
    scrimParticipations: many(scrimParticipants),
    uploadedRoflResults: many(roflMetadata),
    recordedAcquisitions: many(auctionAcquisitions, { relationName: 'acquisitionRecorder' }),
    voidedAcquisitions: many(auctionAcquisitions, { relationName: 'acquisitionVoider' }),
    joinedRegistrations: many(scrimParticipantRegistrations, { relationName: 'registrationJoinedBy' }),
    withdrawnRegistrations: many(scrimParticipantRegistrations, { relationName: 'registrationWithdrawnBy' }),
    positionMmr: many(userPositionMmr),
    appliedMmrApplications: many(gameMmrApplications, { relationName: 'mmrApplicationApplier' }),
    reversedMmrApplications: many(gameMmrApplications, { relationName: 'mmrApplicationReverser' }),
    recordedMmrEntries: many(mmrLedgerEntries, { relationName: 'mmrEntryRecorder' })
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const userChampionPreferencesRelations = relations(userChampionPreferences, ({ one }) => ({
    user: one(users, { fields: [userChampionPreferences.userId], references: [users.id] })
}));

export const guildsRelations = relations(guilds, ({ one, many }) => ({
    discordSettings: one(guildDiscordSettings),
    discordRoles: many(guildDiscordRoles),
    discordChannels: many(guildDiscordChannels),
    members: many(guildMembers),
    riotAccounts: many(guildRiotAccounts),
    scrims: many(scrims),
    mmrSeasons: many(mmrSeasons)
}));

export const guildMembersRelations = relations(guildMembers, ({ one }) => ({
    guild: one(guilds, { fields: [guildMembers.guildId], references: [guilds.id] }),
    user: one(users, { fields: [guildMembers.userId], references: [users.id] })
}));

export const riotAccountsRelations = relations(riotAccounts, ({ many }) => ({
    links: many(guildRiotAccounts),
    scrimParticipations: many(scrimParticipants),
    gameParticipations: many(gameParticipants)
}));

export const guildRiotAccountsRelations = relations(guildRiotAccounts, ({ one }) => ({
    guild: one(guilds, { fields: [guildRiotAccounts.guildId], references: [guilds.id] }),
    account: one(riotAccounts, { fields: [guildRiotAccounts.riotAccountId], references: [riotAccounts.id] }),
    user: one(users, {
        fields: [guildRiotAccounts.userId],
        references: [users.id],
        relationName: 'riotAccountOwner'
    }),
    linkedBy: one(users, {
        fields: [guildRiotAccounts.linkedByUserId],
        references: [users.id],
        relationName: 'riotAccountLinker'
    })
}));

export const scrimsRelations = relations(scrims, ({ one, many }) => ({
    guild: one(guilds, { fields: [scrims.guildId], references: [guilds.id] }),
    mmrSeason: one(mmrSeasons, {
        fields: [scrims.guildId, scrims.mmrSeasonId],
        references: [mmrSeasons.guildId, mmrSeasons.id]
    }),
    creator: one(users, {
        fields: [scrims.createdByUserId],
        references: [users.id],
        relationName: 'scrimCreator'
    }),
    bracketConfirmer: one(users, {
        fields: [scrims.bracketConfirmedByUserId],
        references: [users.id],
        relationName: 'bracketConfirmer'
    }),
    teams: many(scrimTeams),
    participants: many(scrimParticipants),
    matches: many(matches),
    auction: one(auctions),
    discordMessages: many(scrimDiscordMessages),
    rounds: many(scrimRounds),
    mmrApplications: many(gameMmrApplications)
}));

export const auctionsRelations = relations(auctions, ({ one, many }) => ({
    scrim: one(scrims, { fields: [auctions.scrimId], references: [scrims.id] }),
    teams: many(auctionTeams),
    queue: many(auctionQueueEntries),
    lots: many(auctionLots),
    acquisitions: many(auctionAcquisitions)
}));

export const auctionTeamsRelations = relations(auctionTeams, ({ one, many }) => ({
    acquisitions: many(auctionAcquisitions),
    auction: one(auctions, {
        fields: [auctionTeams.scrimId, auctionTeams.auctionId],
        references: [auctions.scrimId, auctions.id]
    }),
    team: one(scrimTeams, {
        fields: [auctionTeams.scrimId, auctionTeams.teamId],
        references: [scrimTeams.scrimId, scrimTeams.id]
    }),
    captain: one(scrimParticipants, {
        fields: [auctionTeams.scrimId, auctionTeams.captainParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id]
    })
}));

export const auctionQueueEntriesRelations = relations(auctionQueueEntries, ({ one }) => ({
    auction: one(auctions, {
        fields: [auctionQueueEntries.scrimId, auctionQueueEntries.auctionId],
        references: [auctions.scrimId, auctions.id]
    }),
    participant: one(scrimParticipants, {
        fields: [auctionQueueEntries.scrimId, auctionQueueEntries.scrimParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id]
    })
}));

export const auctionLotsRelations = relations(auctionLots, ({ one, many }) => ({
    voidedBy: one(users, { fields: [auctionLots.voidedByUserId], references: [users.id] }),
    acquisitions: many(auctionAcquisitions),
    auction: one(auctions, {
        fields: [auctionLots.scrimId, auctionLots.auctionId],
        references: [auctions.scrimId, auctions.id]
    }),
    participant: one(scrimParticipants, {
        fields: [auctionLots.scrimId, auctionLots.scrimParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id]
    })
}));

export const auctionAcquisitionsRelations = relations(auctionAcquisitions, ({ one, many }) => ({
    auction: one(auctions, {
        fields: [auctionAcquisitions.scrimId, auctionAcquisitions.auctionId],
        references: [auctions.scrimId, auctions.id]
    }),
    team: one(auctionTeams, {
        fields: [auctionAcquisitions.scrimId, auctionAcquisitions.auctionId, auctionAcquisitions.teamId],
        references: [auctionTeams.scrimId, auctionTeams.auctionId, auctionTeams.teamId]
    }),
    participant: one(scrimParticipants, {
        fields: [auctionAcquisitions.scrimId, auctionAcquisitions.scrimParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id],
        relationName: 'acquisitionTarget'
    }),
    buyer: one(scrimParticipants, {
        fields: [auctionAcquisitions.scrimId, auctionAcquisitions.buyerParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id],
        relationName: 'acquisitionBuyer'
    }),
    lot: one(auctionLots, {
        fields: [
            auctionAcquisitions.auctionId,
            auctionAcquisitions.scrimParticipantId,
            auctionAcquisitions.lotId
        ],
        references: [auctionLots.auctionId, auctionLots.scrimParticipantId, auctionLots.id]
    }),
    recordedBy: one(users, {
        fields: [auctionAcquisitions.recordedByUserId],
        references: [users.id],
        relationName: 'acquisitionRecorder'
    }),
    voidedBy: one(users, {
        fields: [auctionAcquisitions.voidedByUserId],
        references: [users.id],
        relationName: 'acquisitionVoider'
    }),
    supersedes: one(auctionAcquisitions, {
        fields: [auctionAcquisitions.auctionId, auctionAcquisitions.supersedesId],
        references: [auctionAcquisitions.auctionId, auctionAcquisitions.id],
        relationName: 'acquisitionCorrection'
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
    riotAccount: one(riotAccounts, {
        fields: [scrimParticipants.riotAccountId],
        references: [riotAccounts.id]
    }),
    team: one(scrimTeams, {
        fields: [scrimParticipants.scrimId, scrimParticipants.teamId],
        references: [scrimTeams.scrimId, scrimTeams.id]
    }),
    captainedAuctionTeam: one(auctionTeams),
    auctionLots: many(auctionLots),
    auctionQueueEntries: many(auctionQueueEntries),
    acquisitions: many(auctionAcquisitions, { relationName: 'acquisitionTarget' }),
    purchases: many(auctionAcquisitions, { relationName: 'acquisitionBuyer' }),
    preferences: many(scrimParticipantPreferences),
    registrations: many(scrimParticipantRegistrations),
    gameParticipations: many(gameParticipants),
    mmrEntries: many(mmrLedgerEntries)
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
    bracketNode: one(scrimBracketNodes),
    scrim: one(scrims, { fields: [matches.scrimId], references: [scrims.id] }),
    teamA: one(scrimTeams, {
        fields: [matches.scrimId, matches.teamAId],
        references: [scrimTeams.scrimId, scrimTeams.id],
        relationName: 'matchTeamA'
    }),
    teamB: one(scrimTeams, {
        fields: [matches.scrimId, matches.teamBId],
        references: [scrimTeams.scrimId, scrimTeams.id],
        relationName: 'matchTeamB'
    }),
    winner: one(scrimTeams, {
        fields: [matches.scrimId, matches.winnerTeamId],
        references: [scrimTeams.scrimId, scrimTeams.id],
        relationName: 'matchWinner'
    }),
    games: many(games)
}));

export const roflMetadataRelations = relations(roflMetadata, ({ one, many }) => ({
    uploadedBy: one(users, { fields: [roflMetadata.uploadedByUserId], references: [users.id] }),
    game: one(games),
    gameDataV1: one(roflGameDataV1),
    participants: many(roflParticipants),
    mmrApplications: many(gameMmrApplications)
}));

export const roflParticipantsRelations = relations(roflParticipants, ({ one }) => ({
    metadata: one(roflMetadata, { fields: [roflParticipants.roflMetadataId], references: [roflMetadata.id] }),
    dataV1: one(roflParticipantDataV1),
    gameParticipation: one(gameParticipants)
}));

export const roflGameDataV1Relations = relations(roflGameDataV1, ({ one, many }) => ({
    metadata: one(roflMetadata, {
        fields: [roflGameDataV1.roflMetadataId, roflGameDataV1.projectionVersion],
        references: [roflMetadata.id, roflMetadata.projectionVersion]
    }),
    participants: many(roflParticipantDataV1)
}));

export const roflParticipantDataV1Relations = relations(roflParticipantDataV1, ({ one }) => ({
    gameData: one(roflGameDataV1, {
        fields: [roflParticipantDataV1.roflMetadataId],
        references: [roflGameDataV1.roflMetadataId]
    }),
    participant: one(roflParticipants, {
        fields: [roflParticipantDataV1.roflMetadataId, roflParticipantDataV1.participantIndex],
        references: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
    })
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
    match: one(matches, {
        fields: [games.scrimId, games.matchId],
        references: [matches.scrimId, matches.id]
    }),
    roflMetadata: one(roflMetadata, { fields: [games.roflMetadataId], references: [roflMetadata.id] }),
    participants: many(gameParticipants),
    mmrApplications: many(gameMmrApplications)
}));

export const mmrSeasonsRelations = relations(mmrSeasons, ({ one, many }) => ({
    guild: one(guilds, { fields: [mmrSeasons.guildId], references: [guilds.id] }),
    ratings: many(userPositionMmr),
    scrims: many(scrims)
}));

export const userPositionMmrRelations = relations(userPositionMmr, ({ one, many }) => ({
    season: one(mmrSeasons, { fields: [userPositionMmr.seasonId], references: [mmrSeasons.id] }),
    user: one(users, { fields: [userPositionMmr.userId], references: [users.id] }),
    entries: many(mmrLedgerEntries)
}));

export const gameMmrApplicationsRelations = relations(gameMmrApplications, ({ one, many }) => ({
    game: one(games, {
        fields: [gameMmrApplications.scrimId, gameMmrApplications.gameId],
        references: [games.scrimId, games.id]
    }),
    scrim: one(scrims, {
        fields: [gameMmrApplications.scrimId, gameMmrApplications.seasonId],
        references: [scrims.id, scrims.mmrSeasonId]
    }),
    roflMetadata: one(roflMetadata, {
        fields: [gameMmrApplications.roflMetadataId],
        references: [roflMetadata.id]
    }),
    appliedBy: one(users, {
        fields: [gameMmrApplications.appliedByUserId],
        references: [users.id],
        relationName: 'mmrApplicationApplier'
    }),
    reversedBy: one(users, {
        fields: [gameMmrApplications.reversedByUserId],
        references: [users.id],
        relationName: 'mmrApplicationReverser'
    }),
    entries: many(mmrLedgerEntries)
}));

export const mmrLedgerEntriesRelations = relations(mmrLedgerEntries, ({ one, many }) => ({
    rating: one(userPositionMmr, {
        fields: [mmrLedgerEntries.seasonId, mmrLedgerEntries.ratingId],
        references: [userPositionMmr.seasonId, userPositionMmr.id]
    }),
    application: one(gameMmrApplications, {
        fields: [mmrLedgerEntries.seasonId, mmrLedgerEntries.scrimId, mmrLedgerEntries.applicationId],
        references: [gameMmrApplications.seasonId, gameMmrApplications.scrimId, gameMmrApplications.id]
    }),
    participant: one(scrimParticipants, {
        fields: [mmrLedgerEntries.scrimId, mmrLedgerEntries.scrimParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id]
    }),
    recordedBy: one(users, {
        fields: [mmrLedgerEntries.recordedByUserId],
        references: [users.id],
        relationName: 'mmrEntryRecorder'
    }),
    reverses: one(mmrLedgerEntries, {
        fields: [
            mmrLedgerEntries.ratingId,
            mmrLedgerEntries.applicationId,
            mmrLedgerEntries.scrimParticipantId,
            mmrLedgerEntries.reversesEntryId
        ],
        references: [
            mmrLedgerEntries.ratingId,
            mmrLedgerEntries.applicationId,
            mmrLedgerEntries.scrimParticipantId,
            mmrLedgerEntries.id
        ],
        relationName: 'mmrEntryReversal'
    }),
    // 고유키로 역분개 후속 행은 최대 하나다.
    reversals: many(mmrLedgerEntries, { relationName: 'mmrEntryReversal' })
}));

export const gameParticipantsRelations = relations(gameParticipants, ({ one }) => ({
    game: one(games, {
        fields: [gameParticipants.scrimId, gameParticipants.gameId],
        references: [games.scrimId, games.id]
    }),
    participant: one(scrimParticipants, {
        fields: [gameParticipants.scrimId, gameParticipants.scrimParticipantId],
        references: [scrimParticipants.scrimId, scrimParticipants.id]
    }),
    riotAccount: one(riotAccounts, {
        fields: [gameParticipants.riotAccountId],
        references: [riotAccounts.id]
    }),
    roflParticipant: one(roflParticipants, {
        fields: [gameParticipants.roflMetadataId, gameParticipants.roflParticipantIndex],
        references: [roflParticipants.roflMetadataId, roflParticipants.participantIndex]
    })
}));

export const scrimRoundsRelations = relations(scrimRounds, ({ one, many }) => ({
    scrim: one(scrims, { fields: [scrimRounds.scrimId], references: [scrims.id] }),
    nodes: many(scrimBracketNodes)
}));

export const scrimBracketNodesRelations = relations(scrimBracketNodes, ({ one, many }) => ({
    round: one(scrimRounds, {
        fields: [scrimBracketNodes.scrimId, scrimBracketNodes.roundId],
        references: [scrimRounds.scrimId, scrimRounds.id]
    }),
    match: one(matches, {
        fields: [scrimBracketNodes.scrimId, scrimBracketNodes.matchId],
        references: [matches.scrimId, matches.id]
    }),
    slots: many(scrimBracketSlots, { relationName: 'bracketNodeSlots' }),
    // UNIQUE 제약으로 승자 진출 자리는 최대 하나다.
    winnerDestinations: many(scrimBracketSlots, { relationName: 'bracketWinnerDestination' })
}));

export const scrimBracketSlotsRelations = relations(scrimBracketSlots, ({ one }) => ({
    node: one(scrimBracketNodes, {
        fields: [scrimBracketSlots.scrimId, scrimBracketSlots.nodeId],
        references: [scrimBracketNodes.scrimId, scrimBracketNodes.id],
        relationName: 'bracketNodeSlots'
    }),
    team: one(scrimTeams, {
        fields: [scrimBracketSlots.scrimId, scrimBracketSlots.teamId],
        references: [scrimTeams.scrimId, scrimTeams.id]
    }),
    sourceNode: one(scrimBracketNodes, {
        fields: [scrimBracketSlots.scrimId, scrimBracketSlots.sourceNodeId],
        references: [scrimBracketNodes.scrimId, scrimBracketNodes.id],
        relationName: 'bracketWinnerDestination'
    })
}));

export const guildDiscordSettingsRelations = relations(guildDiscordSettings, ({ one }) => ({
    guild: one(guilds, { fields: [guildDiscordSettings.guildId], references: [guilds.id] })
}));

export const guildDiscordRolesRelations = relations(guildDiscordRoles, ({ one }) => ({
    guild: one(guilds, { fields: [guildDiscordRoles.guildId], references: [guilds.id] })
}));

export const guildDiscordChannelsRelations = relations(guildDiscordChannels, ({ one }) => ({
    guild: one(guilds, { fields: [guildDiscordChannels.guildId], references: [guilds.id] })
}));

export const scrimDiscordMessagesRelations = relations(scrimDiscordMessages, ({ one }) => ({
    scrim: one(scrims, { fields: [scrimDiscordMessages.scrimId], references: [scrims.id] })
}));

export const scrimParticipantPreferencesRelations = relations(scrimParticipantPreferences, ({ one }) => ({
    participant: one(scrimParticipants, {
        fields: [scrimParticipantPreferences.scrimParticipantId],
        references: [scrimParticipants.id]
    })
}));

export const scrimParticipantRegistrationsRelations = relations(scrimParticipantRegistrations, ({ one }) => ({
    participant: one(scrimParticipants, {
        fields: [scrimParticipantRegistrations.scrimParticipantId],
        references: [scrimParticipants.id]
    }),
    joinedBy: one(users, {
        fields: [scrimParticipantRegistrations.joinedByUserId],
        references: [users.id],
        relationName: 'registrationJoinedBy'
    }),
    withdrawnBy: one(users, {
        fields: [scrimParticipantRegistrations.withdrawnByUserId],
        references: [users.id],
        relationName: 'registrationWithdrawnBy'
    })
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type UserChampionPreference = typeof userChampionPreferences.$inferSelect;
export type NewUserChampionPreference = typeof userChampionPreferences.$inferInsert;
export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;
export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
export type RiotAccount = typeof riotAccounts.$inferSelect;
export type NewRiotAccount = typeof riotAccounts.$inferInsert;
export type GuildRiotAccount = typeof guildRiotAccounts.$inferSelect;
export type NewGuildRiotAccount = typeof guildRiotAccounts.$inferInsert;
export type MmrSeason = typeof mmrSeasons.$inferSelect;
export type NewMmrSeason = typeof mmrSeasons.$inferInsert;
export type UserPositionMmr = typeof userPositionMmr.$inferSelect;
export type NewUserPositionMmr = typeof userPositionMmr.$inferInsert;
export type GameMmrApplication = typeof gameMmrApplications.$inferSelect;
export type NewGameMmrApplication = typeof gameMmrApplications.$inferInsert;
export type MmrLedgerEntry = typeof mmrLedgerEntries.$inferSelect;
export type NewMmrLedgerEntry = typeof mmrLedgerEntries.$inferInsert;
export type Scrim = typeof scrims.$inferSelect;
export type NewScrim = typeof scrims.$inferInsert;
export type Auction = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;
export type AuctionTeam = typeof auctionTeams.$inferSelect;
export type NewAuctionTeam = typeof auctionTeams.$inferInsert;
export type AuctionQueueEntry = typeof auctionQueueEntries.$inferSelect;
export type NewAuctionQueueEntry = typeof auctionQueueEntries.$inferInsert;
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

export type GuildDiscordSettings = typeof guildDiscordSettings.$inferSelect;
export type NewGuildDiscordSettings = typeof guildDiscordSettings.$inferInsert;
export type GuildDiscordRole = typeof guildDiscordRoles.$inferSelect;
export type NewGuildDiscordRole = typeof guildDiscordRoles.$inferInsert;
export type GuildDiscordChannel = typeof guildDiscordChannels.$inferSelect;
export type NewGuildDiscordChannel = typeof guildDiscordChannels.$inferInsert;
export type ScrimDiscordMessage = typeof scrimDiscordMessages.$inferSelect;
export type NewScrimDiscordMessage = typeof scrimDiscordMessages.$inferInsert;
export type ScrimParticipantPreference = typeof scrimParticipantPreferences.$inferSelect;
export type NewScrimParticipantPreference = typeof scrimParticipantPreferences.$inferInsert;
export type ScrimParticipantRegistration = typeof scrimParticipantRegistrations.$inferSelect;
export type NewScrimParticipantRegistration = typeof scrimParticipantRegistrations.$inferInsert;
