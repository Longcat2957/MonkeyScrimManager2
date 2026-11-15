# 경매의 직전 작업 취소와 공개 진행 갱신 검증

기준은 `521e7638d5bcee3148d6d898f92e091bed989a34`이다. 경매의 기존 마지막 낙찰/유찰 lot 취소를 실제 작업 원장에 연결해, **직전 여섯 종류의 작업을 한 번 취소**한다. 새 작업을 실행하면 다시 취소할 수 있다. 연속 스택 undo·redo·새 제품 정책이나 외부 endpoint를 추가한 구현으로 설명하지 않는다.

## 실제 MSM1 근거

GitHub 연결로 pin `d60df685e48c180b236342eae81b389ae87e38bf`의 실제 코드를 읽었다. 최신 master의 다른 구현을 기준으로 삼지 않았다.

- [services/auctions/bidding.py](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/auctions/bidding.py#L21)는 추첨·유찰·낙찰·현재 수동 배치·유찰 수동 배치·유찰 복귀를 구분해 역연산한다. 순서 섞기와 초기화는 해당 여섯 작업의 원장에 넣지 않는다.
- [tournament_queries.py의 REVERTIBLE](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/auctions/tournament_queries.py#L231)은 최신 행이 해당 여섯 작업일 때만 UI 취소를 허용한다. 역기록 다음에는 비활성이다. 서비스의 미역행위 탐색만 보고 연속 스택 취소 정책을 만들지 않았다.
- [원장 schema](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/db/alembic/sql/0006_auction_core_bracket_matches.sql#L316)는 작업 순번·종류·대상·원본 작업 참조와 중복 역기록 방지를 갖는다.
- [6종 작업의 통합 테스트](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/tests/integration/auctions/test_bidding.py#L110)는 추첨 취소→대기, 유찰 배치/복귀 취소→유찰, 나머지 취소→현재 후보를 확인한다.

## 실제 변경과 범위

| 직전 작업           | 취소 후 후보 상태 | 보존할 다른 상태                                  |
| ------------------- | ----------------- | ------------------------------------------------- |
| 추첨                | 대기열 맨 앞      | 앞선 낙찰·팀 배정·포인트 유지                     |
| 유찰                | 새 현재 후보      | 유찰 lot는 무효 이력으로 보존                     |
| 낙찰                | 새 현재 후보      | 해당 영입만 무효화해 잔액 복원. 0점도 낙찰로 유지 |
| 현재 후보 수동 배치 | 새 현재 후보      | 가격 없는 수동 영입만 무효화                      |
| 유찰 후보 수동 배치 | 유찰              | 앞선 실제 유찰 기록 유지. 현재 후보로 만들지 않음 |
| 유찰 복귀           | 유찰              | 복귀 lot만 취소하고 앞선 유찰 기록 유지           |

`auction_actions`는 작업 종류·순서·참가자/lot·필요한 영입 원장 참조·역기록 참조만 저장한다. 전체 화면/프로필/포인트의 중복 snapshot을 저장하지 않는다. 경매별 순번·동일 경매 참조·중복 역기록·종류별 payload를 DB 제약으로 제한한다. 기존 lot·영입 원장은 삭제하지 않는다.

`getAuction()`은 `canRevert`를 제공한다. 최신 역기록 뒤와 초기화·준비 재설정·방식 변경 경계 뒤에는 취소할 수 없다. migration 이전의 추첨/복귀 종류를 과거 lot에서 추정하거나 backfill하지 않으며, 기존 기록·현재 편성은 보존하고 새 작업부터 정확히 지원한다. 모든 변경은 기존 내전 잠금·관리 권한·`expectedRevision` 검사를 통과하는 같은 트랜잭션에서 실행한다.

MSM1은 잠기지 않은 대진 준비에서도 마지막 영입을 직접 취소할 수 있지만, MSM2의 확정된 운영 경계는 유지했다. 전원 배치로 경매 완료·내전 ready가 되면 직접 경매 취소를 허용하지 않는다. 기존 요약의 `팀 편성 다시 하기`가 대진 초안을 정리하고 preparing으로 돌아온 뒤 마지막 영입을 취소할 수 있다.

### 관련 파일

- [auction.ts](../../../apps/web/src/lib/server/scrims/auction.ts): 여섯 작업 기록·역연산·단계/동시성 유지.
- [auction-actions.ts](../../../apps/web/src/lib/server/scrims/auction-actions.ts): 최신 행위·순번·역기록·경계 무효화.
- [schema.ts](../../../apps/web/src/lib/server/db/schema.ts), [0005 SQL](../../../apps/web/drizzle/0005_auction_actions.sql): 새 원장. 생성된 snapshot/journal은 생성기 형식을 유지한다. 이후 0006의 취소 복구 필드는 별도 담당자의 변경이다.
- [공유 DTO](../../../apps/web/src/lib/features/scrims/formation.ts), [개발 목](../../../apps/web/src/lib/mocks/teams.ts): 선택적 `canRevert`, 같은 여섯 역연산. 목 초기화도 기존 이력을 무효로 보존한다. 취소 복구 담당자가 상태만 바꿀 수 있는 get/set helper는 없는 목 상태를 생성하지 않는다.
- [DB 회귀](../../../apps/web/tests/api/hard/db/auction.test.ts), [목 회귀](../../../apps/web/tests/auction-undo.test.ts), [HTTP 회귀](../../../apps/web/tests/api/hard/http/auction-undo.test.ts), [공통 fixture](../../../apps/web/tests/api/support/http-auction-fixtures.ts), [브라우저 회귀](../../../apps/web/tests/browser/auction-operations.test.ts).

표현 UI·공개 `/auction/live`·자동 갱신은 root가 구현했다. 이 담당자는 UI source를 수정하지 않고 같은 실제 build와 fixture로 통합 검증한다. 취소는 기존 action을 사용하며 새 공개 `/auction/live`는 관전자의 진행 확인 기능이 소비한다.

## 검증 기록

- 실제 PostgreSQL의 경매/프로필 **27/27** 통과: 기존 경매 10·후보 프로필 8·새 취소 9. 여섯 역연산의 운영 상태 복원, legacy 원장 없음, 초기화/준비 경계, 중복 요청 한 번 커밋과 역기록 한 개를 확인한다. 완료/ready의 직접 취소 거부와 기존 복귀 뒤 허용도 검사했다.
- 개발 목의 여섯 작업 **6/6** 통과. 실제 목 조회 결과의 팀·잔액·대기·유찰·현재 후보를 이전 상태와 비교하고 연속 취소 409를 확인한다.
- 실제 HTTP action **1/1** 통과. 기존 setup/start/draw/revert/pass/restore와 공개 조회, 비로그인 401·일반 멤버 403·stale/연속 취소 409를 확인한다.
- root의 최종 production build에서 HTTP 1개·브라우저 2개 **총 3/3** 통과. 관리자 키보드 추첨→확인창→직전 취소, 390px 관전자의 setup→다른 관리자의 시작/추첨/15P 낙찰 자동 반영, 503 때 기존 85P 보존·10초 재시도, 지연 중 단일 요청, 자동 중지/수동 갱신/재개, hidden/offline 중지와 복귀, SPA 이탈, 관전자 POST 0을 확인했다.
- 수동 새로고침이 15초 넘게 지연된 조건도 실제 실행했다. 대기 중 버튼 잠금→15초 제한 뒤 오류 안내·버튼 해제·기존 85P 보존→10초 뒤 자동 재시도 성공을 확인했다. 실제 poll을 실행하고 Playwright clock으로 대기만 가속했다.
- 공개 화면의 자산은 기존 fixture처럼 외부 origin을 차단한다. 실제 폰트/CDN 가용성 검증과 구분한다. hidden은 `visibilitychange`와 visibilityState 모의 조건, offline은 Playwright context의 네트워크 에뮬레이션이다. 실기기 백그라운드·물리 네트워크·모든 backoff 단계의 인증으로 확대하지 않는다.

최초 브라우저 실행의 확인창 wrapper 0높이·숨긴 `남음`의 공백·request 이벤트와 route callback 순서는 테스트 대기/selector 가정이었다. 실제 패널의 확인 버튼·공백 허용 이름·request 이벤트 집계로 수정해 같은 조건을 통과했다. 제품 회귀로 집계하지 않는다.

**A 낙찰→B 추첨→B 취소 뒤 A 영입/85P를 보존하고 초기화가 활성**인 조건도 최종 build에서 통과했다. 이 조건으로 발견한 root UI의 canReset/canRevert 분리와 관전자의 읽기 전용 대기 문구가 반영된 실제 이미지를 읽었다. build2의 2/2 예비 결과는 추가 조건 이전의 기록으로 구분하며, 최종 3/3과 아래 7장이 현재 source의 근거다. 최신 build 결과·source SHA·직접 읽은 이미지 SHA는 [auction.json](auction.json)에 기록한다.

| 최종 상태                                         | 이미지                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440px 관리자 첫 추첨·키보드 확인창               | [추첨](after/manager-draw-desktop-primary.png)·[확인창](after/manager-confirm-desktop-primary.png)                                                |
| 1440px 관리자 첫 추첨 취소·낙찰 보존 후 추첨 취소 | [대기 복원](after/manager-undo-desktop-primary.png)·[85P·영입·초기화 유지](after/manager-award-preserved-undo-desktop-primary.png)                |
| 390px 관전자 정상·실패·다크                       | [라이트](after/guest-snapshot-mobile-primary.png)·[503 피드백](after/guest-error-mobile-primary.png)·[다크](after/guest-snapshot-mobile-dark.png) |

위 7장을 모두 `view_image`로 직접 읽었다. 새 겹침·잘림·문서 가로 넘침을 관찰하지 않았고 실제 앱 JavaScript·예기치 않은 console 오류는 0이었다. 확인창의 배경 마스크는 실제 1000px viewport를 덮으며 full-page PNG의 아래쪽까지 이어진다고 해석하지 않는다. 촬영용 임시 manifest는 최종 JSON에 병합한 뒤 정리했다. 모든 브라우저·격리 앱·테스트 schema 정리가 완료됐다.

테스트는 전용 schema·격리 앱·고정 Discord/Riot 응답만 사용한다. 실서비스 쓰기·원본 자격증명 기록·새 ignore는 0이다. Safari·물리 기기·스크린리더·실서비스 OAuth·성능 개선율은 이 담당자의 완료 주장에 포함하지 않는다.
