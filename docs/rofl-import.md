# ROFL 서비스용 파싱·적재 모델

P0~P2에서 합의한 정보만 선택하는 모델이다. Drizzle 연결 설정은 준비되어 있으며,
테이블 스키마와 이 모델의 실제 DB 저장은 다음 단계다.
원본 보존과 전체 추출은 [ROFL 분석](rofl.md)의 기존 경로를 유지한다.

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

`projectionVersion`은 서비스용 필드 매핑·검증 규칙의 버전이다. 현재 값은 1이며,
이 규칙을 변경할 때 증가시켜 원본 재파싱의 기준으로 사용한다.
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

## 적재 초안

`apps/web/src/lib/server/rofl/import-model.ts`의 `createRoflImportDraft(bytes, context)`는
파일 지문과 서비스 문맥을 붙인 메모리 내 초안 `RoflImportDraft`를 만든다.

| 초안 영역 | 내용 |
| --- | --- |
| `status` | 항상 `pending_review` |
| `registration` | 서버·내전·Match·Game ID, Match 안에서 1부터 시작하는 `gameNumber` |
| `upload` | 서비스가 전달한 업로더 ID·업로드 시각 |
| `source` | 원본 ROFL과 메타데이터의 보관 키·SHA-256·바이트 수 |
| `game` | 위 서비스용 파싱 결과 |
| `links.teams` | ROFL 팀 값과 서비스 팀 ID의 대응 |
| `links.participants` | ROFL 참가자 인덱스와 서비스 참가자·Riot 계정 ID의 대응 |

`context`는 서비스가 전달한다. 업로드 시각은 유효한 `Date`로 받고 ISO 문자열로 출력한다.
경기 시작 시각을 업로드 시각이나 파일명에서 만들지 않는다.
연결 정보가 없는 팀·참가자는 `null`로 남긴다. 존재하지 않는 ROFL 팀·참가자나 같은 대상에 대한 중복 연결은
`INVALID_IMPORT_CONTEXT`로 거부한다. 실제 서비스 ID 존재 여부와 연결 권한은 다음 등록 단계에서 검증해야 한다.
ROFL PUUID와 Riot API 계정 식별자를 자동 연결하지 않는다.

이 함수는 DB·파일 시스템에 쓰지 않는다. 보관 키는 실제 원본 보관을 담당할 호출자가 제공할 참조다.
메타데이터 해시는 JSON 재직렬화본이 아닌 원본 바이트를 대상으로 한다.
원본 파일 해시는 같은 바이트의 중복 업로드를 확인하는 기준이며, 같은 경기의 서로 다른 파일을 판별하는 경기 ID가 아니다.

## 검증

합성 테스트로 P0~P2 매핑, 슬롯 순서, 누락·잘못된 값, 결과 충돌, 20명 참가자,
서비스 연결과 파일 지문을 검사한다. 실제 16.21·16.5 표본은 선별한 필드를 원본 메타데이터와 별도로 대조한다.
실제 참가자 값은 테스트·문서에 넣지 않고 원본과 결과를 Git에서 제외되는 `samples/`에 둔다.
