# ROFL 서비스용 파싱·적재 모델

P0~P2에서 합의한 정보만 선택하고 현재 DB 스키마의 공통 메타데이터·참가자 및 버전별 데이터 행으로 변환하는 모델이다.
Drizzle 연결 설정과 테이블 정의는 준비되어 있다. 실제 DB 저장은 아직 구현하지 않았고,
추가 스키마의 마이그레이션도 생성·적용하지 않았다.

서비스는 파일 SHA-256·크기, 형식·게임·매핑 버전, 업로더·업로드 시각과 선별한 데이터만 저장한다.
원본 ROFL 파일은 DB나 별도 파일 보관소에 남기지 않으며, 전체 메타데이터·패킷 덤프·보관 경로도 저장하지 않는다.
추출 규칙이 바뀌어 다시 분석하려면 파일을 재업로드해야 한다.
[ROFL 분석](rofl.md)의 전체 추출 명령은 개발자가 명시적으로 실행하는 로컬 연구용으로만 유지한다.

## 서비스용 출력

```sh
pnpm --silent rofl:project samples/replay.rofl > samples/replay-projection.json
```

`apps/web/src/lib/server/rofl/projection.ts`의 `projectRoflGame(bytes)`를 호출한다.
본문 패킷을 압축 해제하지 않고 종료 메타데이터만 읽으며, 입력 파일을 수정하지 않는다.
출력에는 전체 메타데이터·미션 필드·패킷·포지션 추정·목표물 추정이 포함되지 않는다.

| 영역 | 필드 |
| --- | --- |
| 파싱 기준 | `projectionVersion`, `formatVersion`, `gameVersion` |
| 경기 | `gameLengthMs`, `teams`, `result` |
| 참가자 기본값 | `index`, `riotId`, `replayPuuid`, `champion`, `teamId`, `win` |
| 참가자 통계 | `stats`: P0~P2 숫자 필드 33개 |
| 참가자 최종 세팅 | `loadout`: 아이템·주문·룬·능력치 파편 |

`projectionVersion`은 서비스용 필드 매핑·검증 규칙의 버전이며 현재 값은 1이다.
DB의 V1 통계·최종 세팅 계약은 고정한다. 저장 형식이나 의미가 바뀌면 새 버전의 모델·하위 테이블과 매핑을 추가하고,
기존 V1 데이터의 해석을 바꾸지 않는다. 적재 모델이 지원하지 않는 버전은 `UNSUPPORTED_PROJECTION`으로 거부한다.
ROFL 컨테이너의 `formatVersion`이나 게임 패치와는 별개다.
`gameVersion`은 전체 게임 빌드 문자열을 유지한다.
`champion`은 `SKIN`에서 읽은 문자열이며 숫자 챔피언 ID로 임의 변환하지 않는다.

## P0~P2 필드

정확한 원본 키·우선순위·단위는 `ROFL_STAT_FIELDS`에 정의한다.
이 목록에 없는 원본 필드는 운영 통계 모델에 자동 추가하지 않는다.

| 우선순위 | 구분 | `stats` 필드 |
| --- | --- | --- |
| P0 | 기본 성적 | `kills`, `deaths`, `assists`, `minionsKilled`, `neutralMinionsKilled` |
| P1 | 전투·경제 | `damageDealtToChampions`, `damageTaken`, `goldEarned` |
| P1 | 시야 | `visionScore`, `wardsPlaced`, `wardsKilled`, `controlWardsBought` |
| P1 | 최종 레벨 | `level` |
| P2 | 챔피언 대상 피해 구분 | `physicalDamageDealtToChampions`, `magicDamageDealtToChampions`, `trueDamageDealtToChampions` |
| P2 | 받은 피해 구분 | `physicalDamageTaken`, `magicDamageTaken`, `trueDamageTaken` |
| P2 | 회복·보호막 | `totalHeal`, `healOnTeammates`, `damageShieldedOnTeammates` |
| P2 | CC·사망 관련 원값 | `timeCcingOthers`, `totalTimeCrowdControlDealt`, `totalTimeCrowdControlDealtToChampions`, `totalTimeSpentDead` |
| P2 | 멀티킬·연속킬 | `doubleKills`, `tripleKills`, `quadraKills`, `pentaKills`, `killingSprees`, `largestKillingSpree`, `largestMultiKill` |

P1 최종 세팅은 다음 슬롯 순서를 유지한다.

| `loadout` 필드 | ROFL 출처 |
| --- | --- |
| `itemIds` 7칸 | `ITEM0`~`ITEM6` |
| `summonerSpellIds` 2칸 | `SUMMONER_SPELL_1`, `SUMMONER_SPELL_2` |
| `primaryRuneStyleId`, `secondaryRuneStyleId` | `PERK_PRIMARY_STYLE`, `PERK_SUB_STYLE` |
| `runeIds` 6칸 | `PERK0`~`PERK5` |
| `statRuneIds` 3칸 | `STAT_PERK_0`~`STAT_PERK_2` |

아이템의 `0`과 누락된 슬롯의 `null`은 구분한다. 배열에서 빈 칸을 제거하거나 룬 파편 순서에 추가 의미를 붙이지 않는다.
주문 ID와 주문 시전 횟수, 최종 아이템과 구매 이력도 구분한다.

## 값 검증과 결과 상태

- 누락·JSON `null`·빈 문자열은 `null`이다. 실제 숫자 0은 유지한다.
- 선택한 숫자 필드는 비음수 safe integer 또는 해당 정수 문자열만 허용한다. 소수·음수·지수 문자열·boolean·잘못된 타입은 `INVALID_METADATA`로 거부한다.
- Riot ID 같은 문자열 필드는 숫자로 변환하지 않는다. 참가자의 원래 배열 인덱스도 유지한다.
- 피해 합계와 물리·마법·고정 피해 합은 두 실제 표본에서 0~2 차이가 있었다. 서로 독립된 값을 유지하고 합계를 보정하지 않는다.
- CC 관련 세 필드를 합치지 않는다. CC·사망 시간 네 필드는 `unit: unverified`이며 원값을 그대로 저장한다. 단위를 검증하기 전 초·밀리초 환산이나 분당 지표에 사용하지 않는다.
- 총 CS·KDA 비율·분당 통계·팀 합계는 저장 필드에 중복 생성하지 않는다.

시간 필드를 보류한 근거: [ReplayBook 작성자 문서](https://www.fraxiinus.dev/ReplayBook/getting-started/exporting-player-data/)는
`TIME_CCING_OTHERS`를 초로 설명하지만 [실제 모델](https://github.com/fraxiinus/ReplayBook/blob/f53c18bb901f2b07d1198e1ac87a254c17700a79/src/UI.Main/Models/PlayerDetail.cs)은 `CrowdControlScore`에 매핑한다.
현재 두 ROFL 표본만으로 이 차이나 다른 시간 필드의 단위를 확정하지 않는다.

`result.status`는 팀·승패 메타데이터의 일관성만 나타낸다.

| 상태 | 조건 |
| --- | --- |
| `consistent` | 모든 참가자의 팀·승패가 있고, 두 팀 이상이며, 팀 내부 결과가 일치하고 승리 팀이 하나 |
| `incomplete` | 팀·승패가 누락되거나 알려진 팀이 하나뿐인 경우 |
| `conflicting` | 같은 팀의 승패가 충돌하거나, 승리 팀이 여럿이거나, 두 팀 이상의 완전한 결과에 승자가 없는 경우 |

이미 확인된 충돌은 누락보다 우선한다. `winnerTeamId`는 `consistent`일 때만 제공하며,
이 값과 `teams[].teamId`는 ROFL의 팀 값이다. 서비스의 내전 팀 ID가 아니다.
참가자 수나 `100`·`200`이라는 팀 값은 고정하지 않는다.
`consistent`라도 기본 성적·계정 연결이 완전하다는 뜻은 아니며, 서명·소유권·등록 권한을 인증하지 않는다.

## 적재 데이터

`apps/web/src/lib/server/rofl/import-model.ts`의 `prepareRoflImport(bytes, context)`는
파일 지문과 서비스 문맥을 붙인 메모리 내 적재 데이터 `RoflImportData`를 만든다.
파싱 결과 전체를 JSON 하나로 저장하는 대신, 선별한 필드를 아래 네 테이블의 삽입 행으로 변환한다.

| 영역 | 내용 |
| --- | --- |
| `registration` | 서버·내전·Match·Game ID, Match 안에서 1부터 시작하는 `gameNumber` |
| `rows.projectionVersion` | 현재 저장 계약을 구분하는 값 `1` |
| `rows.metadata` | `rofl_metadata`: 새 UUID, 파일 SHA-256·크기, 형식·게임·매핑 버전, 업로더·업로드 시각 |
| `rows.participants` | `rofl_participants`: 메타데이터 ID와 ROFL 참가자 인덱스의 공통 참조 |
| `rows.gameData` | `rofl_game_data_v1`: 메타데이터 ID·매핑 버전, 경기 시간, 결과 일관성, 승리 팀과 팀별 결과 |
| `rows.participantData` | `rofl_participant_data_v1`: 공통 참가자 참조, Riot ID·원시 PUUID·챔피언·팀·승패, 고정된 통계 33개·최종 세팅 |
| `links.teams` | ROFL 팀 값과 서비스 팀 ID의 대응 |
| `links.participants` | ROFL 참가자 인덱스와 `scrimParticipantId`·`riotAccountId`의 대응 |

`context`는 서비스가 전달하며 보관 키를 받지 않는다. 업로드 시각은 유효한 `Date`로 받아 복사한 `Date`를 행에 넣는다.
길드·사용자 ID는 비어 있지 않은 문자열이고, 내전·Match·Game·팀·내전 참가자·Riot 계정 ID는 UUID 형식을 검증해 소문자로 정규화한다.
`gameNumber`는 PostgreSQL integer에 들어가는 1~2,147,483,647의 정수다.
경기 시작 시각을 업로드 시각이나 파일명에서 만들지 않는다.

연결 정보가 없는 팀·참가자는 `null`로 남긴다. 존재하지 않는 ROFL 팀·참가자, 같은 ROFL 대상의 중복 연결,
서로 다른 ROFL 대상을 같은 서비스 팀·내전 참가자·Riot 계정에 연결하는 문맥은 `INVALID_IMPORT_CONTEXT`로 거부한다.
실제 `game_participants` 행에는 ROFL 메타데이터 ID와 참가자 인덱스가 필수다. 미연결 원본 참가자는 ROFL 하위 데이터로 남겨 두고, 서비스 출전 행은 연결이 확인된 뒤에 만든다.
실제 서비스 ID의 존재, 길드·내전 소속과 등록 권한은 향후 저장 단계에서 서버가 검증해야 한다.
ROFL PUUID를 Riot API 계정 식별자로 간주하거나, 팀 값에서 블루·레드를 추정하거나, 챔피언 문자열을 숫자 ID로 자동 변환하지 않는다.
최상위 승인 대기 상태는 없다. `resultStatus`는 데이터 일관성 정보이며 사람의 검토·승인 상태가 아니다.
자동 등록 흐름에서는 필요한 검증과 연결을 통과한 결과를 곧바로 저장하고, 연결 실패·결과 충돌 등만 예외로 처리한다.
하드 피어리스 위반은 안내하며 업로드나 결과 등록을 막지 않는다.

모든 하위 행의 `roflMetadataId`는 `rows.metadata.id`와 같다.
함수 호출마다 새 UUID를 생성하므로 같은 파일을 다시 처리해도 메타데이터 ID는 달라진다.
향후 저장 단계에서는 파일 SHA-256·매핑 버전의 중복 제약을 처리하고,
기존 메타데이터를 재사용한다면 하위 행의 참조까지 함께 맞춰야 한다. 새 UUID로 무조건 삽입하는 방식은 사용할 수 없다.
파일 해시는 같은 바이트의 중복 업로드 기준이며, 같은 경기의 서로 다른 파일을 판별하는 경기 ID가 아니다.

이 함수는 DB·파일 시스템에 쓰지 않으며, DB 스키마는 타입으로만 참조한다.
`registration`과 `links`는 결과를 서비스 경기에 연결하기 위한 문맥이다.
업로드 API·자동 참가자 연결·`Game`·`GameParticipant` 저장·시리즈 집계는 아직 구현하지 않았다.
원본 바이트나 전체 메타데이터를 반환값에 남기지 않는다.

## 검증

합성 테스트로 P0~P2 매핑, 슬롯 순서, 누락·잘못된 값, 결과 충돌, 20명 참가자,
서비스 연결과 파일 지문을 검사한다. 실제 16.21·16.5 표본은 선별한 필드를 원본 메타데이터와 별도로 대조한다.
실제 참가자 값은 테스트·문서에 넣지 않고 원본과 결과를 Git에서 제외되는 `samples/`에 둔다.
