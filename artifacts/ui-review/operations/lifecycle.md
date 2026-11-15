# 내전 취소 복구·중도 종료 보완

2026-11-15, 기준 HEAD `521e763`. 내전 요약의 기존 action을 확장했으며 새 외부 API·시즌 정책·결과 입력 방식은 추가하지 않았다. UI 조립은 루트 작업자가 담당했고 이 기록은 실제 서비스·스키마·개발 샘플과 브라우저 검증 범위를 다룬다.

## 확인한 규칙과 실제 변경

| 문제 | 이전 구현 | 적용한 변경·완료 조건 |
| --- | --- | --- |
| OPS-CANCEL-01 · P1 | 시작 전 취소 뒤 복귀 단계 근거와 복구 동작이 없음 | 새 `recruit`·`preparing`·`ready` 취소에만 이전 내전·경매 상태를 저장한다. 복구는 같은 단계·경매 상태로 돌아가며 참가자·실제 배정·대진·포인트·후보·lot·행위원장을 보존한다. 과거 근거 없는 취소는 구체적 이유로 차단한다 |
| OPS-EARLY-01 · P1 | `in_progress`에서만 종료하고 점수 우세 팀을 표시하지 않음 | `preparing`·`ready`·`in_progress`에서 중도 종료한다. 실제 완료 Game의 점수 우세 팀만 경기 승자로 기록하며 동점은 null이다. 확정 Game·ROFL·출전·MMR·라인업과 완료 경기는 유지한다. 중단한 경기와 내전은 원래 단계로 재개한다 |
| OPS-UI-01 · P2 | 진행 중 취소 버튼은 실제 서비스에서 거절되고 준비 전 결과의 빈 안내는 다음 편성을 유도함 | 루트 UI가 취소 노출 단계를 일치시키고 취소 복구·원래 단계 재개·현재 점수 우세/동점·대진 생성 전 종료 안내를 연결했다. 실제 세션에서 클릭·Enter·Escape와 결과를 확인했다 |

`cancelScrim()`은 현재 내전과 경매의 상태만 취소로 전환한다. 시각·팀장·포인트·낙찰·유찰·현재 후보·대기열·행위를 무효화하지 않는다. `restoreCancelledScrim()`은 현재 권한·revision·Game 부재·취소 전 경매 근거를 확인하고 복원 근거를 비운다. 상태 변경과 Discord 게시 예약은 같은 트랜잭션이다.

`endScrimEarly()`는 완료 세트의 `winnerSide`와 `blueTeamSlot`을 함께 해석한다. 블루/레드가 바뀌어도 실제 A/B 팀 점수로 판정한다. BO 과반을 채우지 않은 1:0도 중도 종료 승자가 될 수 있지만 새 Game이나 MMR 승패를 만들지는 않는다. 준결승 우세 팀으로 결승 Match·우승팀을 생성하지 않는다. 결승이 실제로 진행됐으면 그 결승의 우세 팀만 표시한다.

새 `endedEarlyFromStatus`가 중도 종료한 내전 단계를 보존한다. 바뀐 Match는 기존 `statusBeforeScrimEnd`·이전 종료 시각·사유를 이용해 복원한다. 기존 DB 계약상 중단 전 `pending`·`in_progress` 승자는 null이므로 재개 시 null로 되돌린다. 중단·재개 시 해당 경기 revision을 높여 오래된 업로드 요청을 거절한다. 예전 중도 종료 행의 복귀 단계가 null이면 기존 진행 중 재개 동작을 유지한다.

## MSM1 실제 소스 근거

준용 기준은 프로젝트에 고정한 `d60df685e48c180b236342eae81b389ae87e38bf`다. 최신 master로 바꾸지 않았다. GitHub 플러그인으로 아래 구현과 통합 테스트를 읽었다.

- [일반 모집 lifecycle.py](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/recruitments/lifecycle.py#L191): 취소된 모집의 복구는 보존한 `closed_at`에 따라 OPEN/CLOSED로 돌아간다. [저장 함수](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/recruitments/lifecycle.py#L158)는 취소·전환·게시 식별을 갱신하며 신청·편성 초안을 삭제하지 않는다.
- [경매 모집 recruitments.py](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/auctions/recruitments.py#L279): 취소 모집의 복구도 이전 마감 근거를 사용한다. MSM2는 모집부터 대진까지 같은 Scrim이므로 취소 전 실제 단계와 경매 상태를 저장한다. 과거 자료에서 단계를 추정하지 않는다. 관리자 권한은 기존 MSM2 규칙을 유지한다.
- [중도 마무리 finish.py](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/auctions/finish.py#L107), [점수·상태 저장](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/auctions/finish.py): BIDDING·BRACKET_SETUP·IN_GAME에서 확정 Game·라인업·MMR을 유지하고 현재 점수 우세/동점을 판정한다. 결승이 진행되지 않았으면 우승은 없다. MSM2는 기존 `ended_early` 상태로 이 의미를 표현한다.
- [중도 마무리 통합 테스트](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/tests/integration/auctions/test_finish.py#L21): 입찰·대진 준비·동점·우세·준결승·결승의 실제 조건과 결과/MMR 보존을 확인했다.
- [대회 전체 취소 cancellation.py](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/auctions/cancellation.py#L62)는 Game 전체를 최신 순서로 안전 역분개한 뒤 취소한다. [관련 통합 테스트](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/tests/integration/auctions/test_cancellation.py#L363)는 후속 MMR 변경 시 부분 역분개까지 롤백한다. 이 동작을 취소한 Game/MMR의 무조건 복구로 해석하지 않았다.

## 파일과 migration

- [service.ts](../../../apps/web/src/lib/server/scrims/service.ts): 취소 전 근거 저장·정확 복구·조회/쓰기의 동일 차단 이유.
- [workflow.ts](../../../apps/web/src/lib/server/scrims/workflow.ts): 복구 메뉴 자료, 준비 단계 종료·점수 판정·원래 단계 재개. 기존 방식 변경·모집 재개 경계에 경매 행위 무효화를 연결하며 단순 취소·복구에는 적용하지 않는다.
- [queries.ts](../../../apps/web/src/lib/server/scrims/queries.ts): `endedEarlyFromStatus` 조회 계약.
- [schema.ts](../../../apps/web/src/lib/server/db/schema.ts), [0006](../../../apps/web/drizzle/0006_scrim_cancellation_restore.sql), [0007](../../../apps/web/drizzle/0007_scrim_early_end.sql): nullable 복원 근거와 CHECK. 정상 완료 승자 필수·다른 상태 승자 금지·실제 참가 팀 승자 제약은 유지한다. 기존 행의 단계·승자를 backfill하지 않는다.
- [개발 샘플 scrims](../../../apps/web/src/lib/mocks/scrims.ts)·[workflow](../../../apps/web/src/lib/mocks/workflow.ts)·[bracket](../../../apps/web/src/lib/mocks/bracket.ts): 실제 계약과 같은 취소 복구·원래 단계 재개·변경한 경기만 복원.

## 검증

- 신규 격리 DB **24개 통과**: 취소 복구 9, 0006 업그레이드/CHECK 2, 준비 단계·실제 ROFL 점수·준결승/결승·권한 11, 0007 업그레이드/CHECK 2. 기존 `schema`·`bracket-workflow`까지 묶은 실행은 **49/49**다. 취소 복구 단계에서 기존 `recruitment`·`auction`·`bracket-workflow` **39/39**도 통과했다. 서로 겹치는 기존 테스트를 합산하지 않는다.
- 개발 샘플 신규 **9개**와 기존 `scrims` 6개, 합계 **15/15** 통과.
- 테스트 TypeScript·소유 코드 Prettier·`git diff --check` 통과. 웹/봇 build와 최종 전체 검사는 루트 기록을 따른다.
- [브라우저 테스트](../../../apps/web/tests/browser/scrim-lifecycle.test.ts) **4/4**: 최신 루트 프로덕션 빌드와 격리 DB·실제 서명 세션에서 Chromium 1440×1000·390×844, primary/dark. 외부 API는 고정 응답이고 공개 네트워크 이미지·폰트는 차단했다. 실제 Discord 발송·실서비스 DB 쓰기는 없다.
- 각 조건에서 키보드로 메뉴 열기, 취소 확인창 Escape 후 상태 유지, 취소·복구·준비 중도 종료·원래 단계 복귀, 실제 ROFL 1:0 중도 종료 승자·재개를 확인했다. Game·출전·MMR 반영·원장·현재 점수는 전후 일치한다. JS 오류와 가로 넘침은 없었다. 실제 터치 장치·스크린리더·성능 수치는 측정하지 않았다.

## 실제 이미지 읽기

[촬영 목록·SHA-256](after/lifecycle/captures.json)의 **최종 16장 전부**를 `view_image`로 읽었다. 각 크기·테마에서 취소 확인창, 취소 뒤 복구 메뉴, 대진 생성 전 중도 종료 결과, 1:0 우세 결과를 확인했다. 동적 테스트 URL은 목록에 기록했다. 새로 제공한 상태이므로 동일 상태의 이전 동작 사진은 없다.

모바일 확인 문구는 두 줄로 읽히며 확인/취소 버튼이 겹치지 않는다. 복구는 데스크톱의 단일 팝오버·모바일 하단 메뉴 한 곳에 있고 화면 밖으로 나가지 않는다. 준비 전 종료는 다음 편성을 요구하지 않고 이미 종료됐음을 안내한다. 우세 결과는 중도 종료 상태·1:0 점수·승자를 함께 표시한다. 표면·보조 문구·상태의 양 테마 구분을 유지했고 이 범위에서 새 배치 결함은 확인하지 않았다. 수치 대비 인증이나 전체 사이트 접근성 등급을 주장하지 않는다.

최초 확인창·메뉴 두 이미지는 STDF 진입 전환 중 축소/투명 프레임이었다. UI 결함으로 단정하지 않고 같은 상태·뷰포트·파일에서 500ms와 fonts/2RAF 정착 뒤 재촬영해 최종 이미지를 다시 읽고 해시를 갱신했다. 전환 대기를 위해 제품 UI를 바꾸지는 않았다.

Impeccable의 `harden`은 근거·오류·동시성·보존 경계, `clarify`는 취소 복구·종료/동점·빈 결과 문구, `adapt`는 기존 팝오버/하단 메뉴와 모바일 확인창 검증에 해당한다. 기존 제품 팔레트·STDF·작업판 구조를 유지했다. 이 기록은 해당 상태의 재검증이며 전체 UI audit을 반복한 결과로 표시하지 않는다.

## 남은 범위

진행 중 전체 내전 취소에 따른 모든 Game/MMR의 안전한 역분개와 그 후 모집 복귀는 이번 범위에서 구현하지 않았다. 현재 마지막 세트 취소는 후속 경기의 확정 라인업·Game·revision과 후속 점수 변경을 검사하므로 단순 반복 호출로 전체 취소를 대체할 수 없다. 별도 트랜잭션 안에서 후속 대진부터 역순으로 검증하고, 다른 내전·관리 보정 원장을 넘지 않으며 어느 단계든 실패하면 전체를 롤백하는 후속 작업이 필요하다. 취소된 결과를 무조건 되살리는 정책은 확인되지 않았다.

근거 없는 과거 취소는 계속 복구 불가다. 시즌 종료·전환, 실제 배포·Discord 운영 검증은 독립 로드맵을 따른다.
