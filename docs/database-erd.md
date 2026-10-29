# MSM2 데이터베이스 ERD

기준: [schema.ts](../apps/web/src/lib/server/db/schema.ts)의 **31개 테이블·67개 외래키**.
아래는 스키마 정의이며, 현재 DB에 이 전체 구조를 마이그레이션한 상태는 아니다.

서비스는 모집·팀 편성·경매·대진을 관리하고, 경기 최종 결과는 ROFL에서 받아 기록한다.
밴픽 진행·픽 순서·수동 결과 승인 모델과 원본 ROFL 보관 테이블은 없다.

## 전체 개요

모든 테이블과 대표 관계를 표시한다. 역할이 다른 외래키와 복합키는 아래 상세 ERD에 표시한다.

```mermaid
erDiagram
    users ||--o{ guild_members : 소속
    guilds ||--o{ guild_members : 구성원
    users |o..o{ riot_accounts : 계정_연결
    users ||--o{ user_champion_preferences : 포지션별_선호
    users ||--o| user_privacy_settings : 공개_설정
    guilds ||--o| guild_discord_settings : 게시_설정

    guilds ||..o{ mmr_seasons : MMR_시즌
    mmr_seasons ||..o{ user_position_mmr : 포지션별_점수
    users |o..o{ user_position_mmr : MMR_소유자
    mmr_seasons |o..o{ scrims : 반영_시즌
    games ||..o{ game_mmr_applications : MMR_반영_회차
    rofl_metadata ||..o{ game_mmr_applications : 반영_근거
    user_position_mmr ||..o{ mmr_ledger_entries : 점수_원장
    game_mmr_applications |o..o{ mmr_ledger_entries : 경기별_변경

    guilds ||..o{ scrims : 내전
    scrims ||..o{ scrim_teams : 팀
    scrims ||..o{ scrim_participants : 참가자
    scrim_teams |o..o{ scrim_participants : 배정
    scrim_participants ||--o{ scrim_participant_preferences : 희망_포지션
    scrim_participants ||..o{ scrim_participant_registrations : 신청_이력
    scrims ||--o| scrim_discord_messages : 모집_게시물

    scrims ||..o| auctions : 경매
    auctions ||--o{ auction_teams : 팀장과_예산
    auctions ||..o{ auction_lots : 후보_등장
    auction_teams ||..o{ auction_acquisitions : 구매_이력
    auction_lots |o..o{ auction_acquisitions : 낙찰과_정정

    scrims ||..o{ scrim_rounds : 라운드
    scrim_rounds ||..o{ scrim_bracket_nodes : 계획_경기
    scrim_bracket_nodes ||--o{ scrim_bracket_slots : 대진_자리
    matches |o..o| scrim_bracket_nodes : 실제_시리즈
    scrims ||..o{ matches : 시리즈
    matches ||..o{ games : 개별_경기
    games ||--o{ game_participants : 출전_기록
    scrim_participants ||--o{ game_participants : 서비스_참가자

    rofl_metadata |o..o| games : 채택한_결과
    rofl_metadata ||--o{ rofl_participants : 원본_참가자_키
    rofl_metadata ||--o| rofl_game_data_v1 : V1_경기
    rofl_game_data_v1 ||--o{ rofl_participant_data_v1 : V1_참가자
    rofl_participants ||--o| rofl_participant_data_v1 : 버전별_상세
    rofl_participants ||..o| game_participants : 필수_ROFL_근거
```

## 상세 표기

- `||`: 정확히 하나, `o|`: 없거나 하나, `o{`: 없거나 여러 개.
- 실선은 부모 키가 자식 기본키에 포함되는 식별 관계, 점선은 그 외 관계다.
- `PK`가 여러 열에 있으면 하나의 복합 기본키다. `FK`는 외래키 구성 열이며, `UK`는 단일 열 고유키다.
- 필드는 관계와 주요 상태 위주로 발췌했다. `NULL 허용` 표시가 없는 표시 필드는 필수다.
- 상세 ERD의 연결선은 실제 DB 외래키 67개를 각각 나타낸다. Drizzle 조회용 `relations` 자체가 DB 제약을 추가하지는 않는다.

## 사용자·길드·계정

```mermaid
erDiagram
    users {
        text id PK
        text username
        boolean is_service_admin
    }
    guilds {
        text id PK
        text name
    }
    guild_members {
        text guild_id PK, FK
        text user_id PK, FK
        boolean is_admin
    }
    riot_accounts {
        uuid id PK
        text puuid UK
        text user_id FK "NULL 허용"
    }
    user_champion_preferences {
        text user_id PK, FK
        enum position PK
        integer champion_id PK
    }
    user_privacy_settings {
        text user_id PK, FK
        boolean public_profile_enabled
        boolean show_riot_ids
        boolean allow_external_record_search
    }
    guild_discord_settings {
        text guild_id PK, FK
        text recruitment_channel_id "NULL 허용"
        text result_channel_id "NULL 허용"
    }

    users ||--o{ guild_members : user_id
    guilds ||--o{ guild_members : guild_id
    users |o..o{ riot_accounts : user_id
    users ||--o{ user_champion_preferences : user_id
    users ||--o| user_privacy_settings : user_id
    guilds ||--o| guild_discord_settings : guild_id
```

## MMR 시즌·현재 점수·변동 이력

```mermaid
erDiagram
    mmr_seasons {
        uuid id PK
        text guild_id FK
        text name
        timestamptz started_at
        timestamptz ended_at "NULL이면 활성 시즌"
    }
    user_position_mmr {
        uuid id PK
        uuid season_id FK
        text user_id FK "NULL 허용"
        enum position
        float8 mmr "기본 1500"
        integer revision
    }
    scrims {
        uuid id PK
        text guild_id FK
        uuid mmr_season_id FK "NULL 허용"
    }
    game_mmr_applications {
        uuid id PK
        uuid scrim_id FK
        uuid game_id FK
        uuid season_id FK
        uuid rofl_metadata_id FK
        integer revision
        timestamptz applied_at
        text applied_by_user_id FK "NULL 허용"
        timestamptz reversed_at "NULL 허용"
        text reversed_by_user_id FK "NULL 허용"
        text reversal_reason "역분개 시 필수"
    }
    mmr_ledger_entries {
        uuid id PK
        uuid season_id FK
        uuid rating_id FK
        integer revision
        enum kind
        uuid application_id FK "조정이면 NULL"
        uuid scrim_id FK "조정이면 NULL"
        uuid scrim_participant_id FK "조정이면 NULL"
        float8 before_mmr
        float8 after_mmr
        uuid reverses_entry_id FK, UK "역분개이면 필수"
        text reason "조정·역분개 시 필수"
        text recorded_by_user_id FK "NULL 허용"
    }

    guilds ||..o{ mmr_seasons : guild_id
    mmr_seasons ||..o{ user_position_mmr : season_id
    users |o..o{ user_position_mmr : user_id
    mmr_seasons |o..o{ scrims : "guild_id, mmr_season_id"
    games ||..o{ game_mmr_applications : "scrim_id, game_id"
    scrims ||..o{ game_mmr_applications : "scrim_id, season_id"
    rofl_metadata ||..o{ game_mmr_applications : rofl_metadata_id
    users |o..o{ game_mmr_applications : applied_by_user_id
    users |o..o{ game_mmr_applications : reversed_by_user_id
    user_position_mmr ||..o{ mmr_ledger_entries : "season_id, rating_id"
    game_mmr_applications |o..o{ mmr_ledger_entries : "season_id, scrim_id, application_id"
    scrim_participants |o..o{ mmr_ledger_entries : "scrim_id, scrim_participant_id"
    users |o..o{ mmr_ledger_entries : recorded_by_user_id
    mmr_ledger_entries |o..o| mmr_ledger_entries : "rating_id, application_id, scrim_participant_id, reverses_entry_id"
```

MMR은 길드·시즌·Discord 사용자·포지션별로 관리한다. 길드 탈퇴로 점수를 지우지 않으며,
사용자 삭제 시 개인 연결만 해제하고 원장은 보존한다. 내전에는 같은 길드의 시즌만 연결할 수 있다.

길드별 활성 시즌과 Game별 유효 반영은 각각 하나다. Game 반영 회차·점수 변경 revision,
반영별 사용자/참가자·원본당 역분개를 고유키로 구분한다. 변경 전·후 수치를 저장하고 증감은 두 값의 차로 구한다.
원장은 ROFL 교체 때 재생성되는 출전 행 대신 보존되는 참가자·반영 회차를 참조한다.

사용자·포지션·시즌 미확정으로 MMR을 보류하더라도 정상 ROFL 경기 결과는 저장할 수 있다.
Elo 계산, 원자적 반영과 과거 경기 정정 순서는 [MMR 저장 계약](mmr.md)을 따르는 후속 서비스 작업이다.

## 모집·팀 편성

```mermaid
erDiagram
    scrims {
        uuid id PK
        text guild_id FK
        text created_by_user_id FK "NULL 허용"
        uuid mmr_season_id FK "NULL 허용"
        enum status
        enum formation_method "NULL 허용"
        integer team_count
        integer reserve_capacity
        boolean is_hard_fearless
    }
    scrim_teams {
        uuid id PK
        uuid scrim_id FK
        text name
    }
    scrim_participants {
        uuid id PK
        uuid scrim_id FK
        text user_id FK "NULL 허용"
        uuid riot_account_id FK "NULL 허용"
        uuid team_id FK "NULL 허용"
        enum position "NULL 허용"
        text display_name
    }
    scrim_participant_preferences {
        uuid scrim_participant_id PK, FK
        enum position PK
        integer priority
    }
    scrim_participant_registrations {
        uuid id PK
        uuid scrim_participant_id FK
        enum status
        timestamptz joined_at
        text joined_by_user_id FK "NULL 허용"
        timestamptz withdrawn_at "NULL 허용"
        text withdrawn_by_user_id FK "NULL 허용"
        text withdrawal_reason "NULL 허용"
    }
    scrim_discord_messages {
        uuid scrim_id PK, FK
        text channel_id
        text message_id UK
    }

    guilds ||..o{ scrims : guild_id
    users |o..o{ scrims : created_by_user_id
    scrims ||..o{ scrim_teams : scrim_id
    scrims ||..o{ scrim_participants : scrim_id
    users |o..o{ scrim_participants : user_id
    riot_accounts |o..o{ scrim_participants : riot_account_id
    scrim_teams |o..o{ scrim_participants : "scrim_id, team_id"
    scrim_participants ||--o{ scrim_participant_preferences : scrim_participant_id
    scrim_participants ||..o{ scrim_participant_registrations : scrim_participant_id
    users |o..o{ scrim_participant_registrations : joined_by_user_id
    users |o..o{ scrim_participant_registrations : withdrawn_by_user_id
    scrims ||--o| scrim_discord_messages : scrim_id
```

동일 내전에서 사용자·Riot 계정은 중복 참가할 수 없고, 팀별 배정 포지션도 중복되지 않는다.

실출전 정원은 `team_count × 5`, 전체 신청 정원은 여기에 `reserve_capacity`를 더한 값이다.
`reserve_capacity`는 기본값 0인 음이 아닌 정수다. 예를 들어 `team_count = 2`,
`reserve_capacity = 2`이면 10명 내전에 최대 12명의 활성 신청을 받아 최종 참가자 10명을 정할 수 있다.
신청 순서에 따른 자동 선발·대기 배정이나 자동 승급은 전제하지 않는다.

신청 상태는 `pending`(선발 전), `selected`(선발), `standby`(대기), `withdrawn`(자진 철회),
`excluded`(운영자 제외)로 구분한다. `withdrawn`·`excluded`일 때만 `withdrawn_at`을 기록하며,
`withdrawn_at IS NULL`인 활성 신청은 참가자당 하나다. 제외 시에도 참가자·신청 행을 삭제하지 않고
처리 시각·행위자·사유를 남긴다. 재신청은 기존 참가자에 새 신청 행을 연결하여 이전 이력을 보존한다.

신청 정원은 전체 참가자 행 수가 아닌 활성 신청 수로 검사한다. 팀 편성에 들어가기 전에는
`selected` 수가 `team_count × 5`와 일치해야 하며, 팀 배정·경매 팀장·경매 후보·게임 출전은 선발된
참가자만 대상으로 한다. 이 인원수·상태 검사와 제외 시 미확정 팀 배정 정리는 이후 서비스에서
같은 트랜잭션으로 처리할 조건이며, 현재 DB 제약만으로 자동 수행하지 않는다.

## 경매·구매 이력

```mermaid
erDiagram
    auctions {
        uuid id PK
        uuid scrim_id FK, UK
        enum status
    }
    auction_teams {
        uuid auction_id PK, FK
        uuid team_id PK, FK
        uuid scrim_id FK
        uuid captain_participant_id FK
        integer initial_points
    }
    auction_lots {
        uuid id PK
        uuid scrim_id FK
        uuid auction_id FK
        uuid scrim_participant_id FK
        integer sequence_number
        enum status
        timestamptz opened_at
        timestamptz closed_at "open이면 NULL, 그 외 필수"
    }
    auction_acquisitions {
        uuid id PK
        uuid scrim_id FK
        uuid auction_id FK
        uuid scrim_participant_id FK
        uuid team_id FK
        uuid buyer_participant_id FK "NULL 허용"
        uuid lot_id FK "NULL 허용"
        enum method
        integer price "NULL 허용"
        text recorded_by_user_id FK "NULL 허용"
        timestamptz voided_at "NULL 허용"
        text voided_by_user_id FK "NULL 허용"
        uuid supersedes_id FK, UK "NULL 허용"
    }

    scrims ||..o| auctions : scrim_id
    auctions ||--o{ auction_teams : "scrim_id, auction_id"
    scrim_teams ||--o| auction_teams : "scrim_id, team_id"
    scrim_participants ||..o| auction_teams : "scrim_id, captain_participant_id"
    auctions ||..o{ auction_lots : "scrim_id, auction_id"
    scrim_participants ||..o{ auction_lots : "scrim_id, scrim_participant_id"
    auctions ||..o{ auction_acquisitions : "scrim_id, auction_id"
    auction_teams ||..o{ auction_acquisitions : "scrim_id, auction_id, team_id"
    scrim_participants ||..o{ auction_acquisitions : "scrim_id, scrim_participant_id"
    scrim_participants |o..o{ auction_acquisitions : "scrim_id, buyer_participant_id"
    auction_lots |o..o{ auction_acquisitions : "auction_id, scrim_participant_id, lot_id"
    users |o..o{ auction_acquisitions : recorded_by_user_id
    users |o..o{ auction_acquisitions : voided_by_user_id
    auction_acquisitions |o..o| auction_acquisitions : "auction_id, supersedes_id"
```

경매는 내전당 하나이므로 한 팀·참가자가 연결되는 경매 팀 행도 각각 최대 하나다.
열린 경매 후보는 경매당 하나, 무효화되지 않은 영입은 경매·참가자당 하나다.
낙찰은 구매자·경매 시도·비음수 가격이 필수이고, 수동 배정은 구매자·가격이 `NULL`이다.
정정은 기존 행을 무효화하고 새 행의 `supersedes_id`로 연결해 구매 이력을 남긴다.

## 라운드·대진·경기 결과

```mermaid
erDiagram
    scrim_rounds {
        uuid id PK
        uuid scrim_id FK
        integer round_number
        integer best_of
    }
    scrim_bracket_nodes {
        uuid id PK
        uuid scrim_id FK
        uuid round_id FK
        integer match_number
        uuid match_id FK, UK "NULL 허용"
    }
    scrim_bracket_slots {
        uuid node_id PK, FK
        enum slot PK
        uuid scrim_id FK
        uuid team_id FK "NULL 허용"
        uuid source_node_id FK, UK "NULL 허용"
    }
    matches {
        uuid id PK
        uuid scrim_id FK
        uuid team_a_id FK
        uuid team_b_id FK
        integer best_of
        boolean is_hard_fearless
        enum status
        uuid winner_team_id "NULL 허용, A 또는 B를 CHECK"
    }
    games {
        uuid id PK
        uuid scrim_id FK
        uuid match_id FK
        integer game_number
        enum blue_team_slot
        enum status
        enum winner_side "NULL 허용, completed이면 필수"
        uuid rofl_metadata_id FK, UK "NULL 허용, completed이면 필수"
    }
    game_participants {
        uuid game_id PK, FK
        uuid scrim_participant_id PK, FK
        uuid scrim_id FK
        uuid riot_account_id FK "NULL 허용"
        enum side
        enum position "NULL 허용"
        integer champion_id "NULL 허용"
        uuid rofl_metadata_id FK
        integer rofl_participant_index FK
    }

    scrims ||..o{ scrim_rounds : scrim_id
    scrim_rounds ||..o{ scrim_bracket_nodes : "scrim_id, round_id"
    matches |o..o| scrim_bracket_nodes : "scrim_id, match_id"
    scrim_bracket_nodes ||--o{ scrim_bracket_slots : "scrim_id, node_id"
    scrim_teams |o..o{ scrim_bracket_slots : "scrim_id, team_id"
    scrim_bracket_nodes |o..o| scrim_bracket_slots : "scrim_id, source_node_id"
    scrims ||..o{ matches : scrim_id
    scrim_teams ||..o{ matches : "scrim_id, team_a_id"
    scrim_teams ||..o{ matches : "scrim_id, team_b_id"
    matches ||..o{ games : "scrim_id, match_id"
    rofl_metadata |o..o| games : rofl_metadata_id
    games ||--o{ game_participants : "scrim_id, game_id"
    games ||--o{ game_participants : "game_id, rofl_metadata_id"
    scrim_participants ||--o{ game_participants : "scrim_id, scrim_participant_id"
    riot_accounts |o..o{ game_participants : riot_account_id
    rofl_participants ||..o| game_participants : "rofl_metadata_id, rofl_participant_index"
```

`Match`는 두 팀의 시리즈이고 `Game`은 개별 한 판이다. 점수는 완료 Game에서 집계한다.
`winner_team_id`는 별도 FK가 아니라 A/B 팀 중 하나인지 확인하는 `CHECK`로 제한한다.
대진 자리는 직접 지정한 팀 또는 이전 대진의 승자 중 하나를 참조하며 둘 다 미정일 수도 있다.

출전 기록의 ROFL 참조는 필수다. `(game_id, rofl_metadata_id)` FK가 해당 Game의 채택본과 연결되도록 하고,
`(rofl_metadata_id, rofl_participant_index)` FK가 실제 ROFL 참가자 존재를 보장한다.
Game의 채택 메타 고유키와 Game별 ROFL 인덱스 고유키 때문에 ROFL 참가자당 출전 기록은 최대 하나다.
같은 두 ROFL 참조 열에는 역조회용 복합 인덱스가 있다.

## ROFL 공통 메타·버전별 결과

```mermaid
erDiagram
    rofl_metadata {
        uuid id PK
        text file_sha256
        bigint file_size_bytes
        integer format_version
        text game_version
        integer projection_version
        text uploaded_by_user_id FK "NULL 허용"
        timestamptz uploaded_at
    }
    rofl_participants {
        uuid rofl_metadata_id PK, FK
        integer participant_index PK
    }
    rofl_game_data_v1 {
        uuid rofl_metadata_id PK, FK
        integer projection_version FK "항상 1"
        bigint game_length_ms
        enum result_status
        bigint winner_replay_team_id "NULL 허용"
        jsonb teams
    }
    rofl_participant_data_v1 {
        uuid rofl_metadata_id PK, FK
        integer participant_index PK, FK
        text game_name "NULL 허용"
        text tag_line "NULL 허용"
        text replay_puuid "NULL 허용"
        text champion "NULL 허용"
        bigint replay_team_id "NULL 허용"
        boolean win "NULL 허용"
        jsonb stats
        jsonb loadout
    }

    users |o..o{ rofl_metadata : uploaded_by_user_id
    rofl_metadata ||--o{ rofl_participants : rofl_metadata_id
    rofl_metadata ||--o| rofl_game_data_v1 : "rofl_metadata_id, projection_version"
    rofl_game_data_v1 ||--o{ rofl_participant_data_v1 : rofl_metadata_id
    rofl_participants ||--o| rofl_participant_data_v1 : "rofl_metadata_id, participant_index"
```

원본 파일·전체 메타데이터·패킷은 저장하지 않는다. 지문·버전과 P0~P2 선별 결과만 저장한다.
`(file_sha256, projection_version)`은 고유하고 V1 하위 모델은 공통 메타의 버전 1만 참조한다.
서비스 참가자를 아직 연결하지 못한 ROFL 참가자는 공통 키와 버전별 결과에 남기며,
ROFL 근거 없는 `game_participants` 행을 먼저 만들지 않는다.

## 함께 적용되는 제약

- 복합 FK의 `scrim_id`는 서로 다른 내전의 팀·참가자·Match·Game·대진이 연결되지 않도록 한다.
- 사용자 삭제 시 멤버십·개인 설정은 삭제되고, 과거 참가·업로더·작업자 연결은 `SET NULL`로 해제된다. 경기·경매 이력의 참조는 `RESTRICT`로 보호한다.
- 하드 피어리스는 안내 규칙이며 업로드를 막는 DB 제약이 없다.
- 팀 정원·경매 예산 합계·대진 순환·시리즈 종료 점수는 단일 행의 관계만으로 보장하지 않는다. 이 문서의 ERD가 해당 동작의 구현 완료를 뜻하지는 않는다.
