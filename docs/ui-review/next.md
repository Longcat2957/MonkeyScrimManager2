# 추가 기능 구현과 UI 최종 검증

2026-11-15. 기준 커밋 `a98210a` 이후 추가 승인된 세 범위를 구현했다. 기존 전체20종 화면의 Impeccable 개선은 앞선 보고서에 보존하며, 이번에 전체20페이지를 다시 촬영했다고 합산하지 않는다. 이번 핵심 대상은 서버 홈·개인 전적·통계·내전 요약·수동 편성·대진·경기 상세 **7종**, 직접 UI 수정은 **5종**, 검토·브라우저 재검증은 **7종**이다. 공통 확인창을 쓰는 기존 계정·경매·결과 흐름은 정규 브라우저 회귀에 포함한다.

## 실행 작업과 완료 조건

| ID | 우선순위·직접 확인 근거 | 실제 변경과 완료 조건 | 결과 |
| --- | --- | --- | --- |
| NX-01 | P1. 진행 중 내전 전체 취소가 없고 마지막 세트 취소의 반복 호출로 대체할 수 없음 | 같은 트랜잭션에서 의존 순서대로 Game/MMR 역분개, 다른 내전·관리 보정 장벽이면 전체 롤백. Match·출전·ROFL 원자료/FK 보존, 취소 배치로 현재 대진만 분리. 복구는 편성 준비이고 결과 재개가 아님 | 완료. DB14·HTTP2, 실제 ROFL1·4팀5세트·경매·0결과·재편성·동시성·게시실패 확인 |
| NX-02 | P1. DB/ROFL의 자원 제한과 안전한 요청 관측 경계 부족 | PostgreSQL 실제 statement/lock/transaction 취소와 연결 점유 제한·풀 복구, client 없는 연결 실패503. ROFL 입장/본문/worker 제한·실제 종료, 안전한 요청 ID·코드·시간만 기록 | 완료. 운영 DB5·HTTP2, 실제 worker 종료/같은 입력 재시도, 브라우저429·503 입력 보존 |
| NX-03 | P2. 전적·통계·순위를 과거 시즌으로 조회할 수 없음 | 같은 서버 시즌만 선택·검증, 집계/MMR/순위 추가 조회·선수 링크의 시즌 유지, 다른 필터 보존·쪽 초기화. 홈 운영 데이터는 현재 유지 | 완료. 실제 ROFL3세트→시즌 전환·빈 시즌 탈출·키보드·ARIA·늦은 응답 차단 |
| NX-03a | P2. 실제390px 이미지에서 긴 시즌 옵션이 잘림 | STDF ActionMenu의 opt-in wrapContent로 고정 높이·말줄임 해제, 실제 버튼 펼침 상태 보완 | 완료. 수정 전390 경계 테스트 실패→수정 후 통과. 320/768/1024 추가 이미지·텍스트 경계 확인 |
| NX-01a | P2. 실제1440px 확인창의 장문이 화면 전체 폭으로 펼쳐짐 | 공통 ConfirmDialog 실제 패널 최대36rem/85dvh, 본문 왼쪽 정렬·28px 행간 | 완료. 두 폭·양 테마에서 본문 폭600px 이하·취소 초기 포커스·Escape·확인·복귀 검증 |
| NX-01b | P2. 전체 취소 후 빈 대진이 다시 편성하라는 안내를 표시 | 기존 BracketBoard의 emptyMessage 변형으로 취소 원인만 안내. 결과 경로의307→대진 정책과 편집 금지는 유지 | 완료. 공개 대진 전후1440/390, 실제 취소 뒤 결과 경로 이동·편집 없음·복구 회귀 |

규칙은 MSM1 pin `d60df685e48c180b236342eae81b389ae87e38bf`의 실제 구현과 대조했다. 완료·중도 종료 내전까지 취소를 확장하지 않고, 기존 시작 전 취소의 정확 복구를 유지한다. manual은 배정을, auction은 팀장·시작 포인트를 재사용하며 이전 영입 효과를 다시 적용하지 않는다. 자세한 원장/잠금/이력 근거는 [취소 검증](../../artifacts/ui-review/next/cancellation.md), [운영 검증](../../artifacts/ui-review/next/operations.md), [시즌 검증](../../artifacts/ui-review/next/seasons.md)을 따른다.

## Impeccable 적용과 코드

- **extract:** [SeasonSelector](../../apps/web/src/lib/components/common/SeasonSelector.svelte)를 실제 동일 과업의 전적·통계·순위3곳에서 사용한다. 기존 STDF Button·ActionMenu를 재사용하며 시즌이 하나면 정적 이름, 기록이 비어 있어도 선택을 제공한다.
- **clarify·harden:** [운영 메뉴](../../apps/web/src/lib/components/scrims/ScrimOperationsBar.svelte)는 세트 수·역분개·이력 보존과 복구 의미를 설명한다. [취소 서비스](../../apps/web/src/lib/server/scrims/cancellation.ts)는 추정 복구와 부분 저장을 막는다. [대진](../../apps/web/src/routes/g/[guildId]/scrims/[scrimId]/bracket/+page.svelte)은 취소와 준비 중 빈 상태를 구분한다.
- **adapt·typeset·polish:** [ActionMenu](../../apps/web/src/lib/components/common/ActionMenu.svelte)의 긴 문구 변형은 시즌 선택에만 적용하고, [ConfirmDialog](../../apps/web/src/lib/components/common/ConfirmDialog.svelte)는 설치 STDF의 최대 폭 옵션 부재를 호스트 패널 CSS로 좁게 보완한다. 기존 Slate·타입·상태색·브랜드는 유지했다.
- **harden:** [RankingBoard](../../apps/web/src/lib/components/guild/RankingBoard.svelte)는 시즌을 추가 조회에 고정하고 이전 요청을 취소한다. [시즌 조회](../../apps/web/src/lib/server/records/seasons.ts)는 다른 서버·미존재 UUID를 거절한다. [DB 풀](../../apps/web/src/lib/server/db/pool.ts)·[ROFL 제한](../../apps/web/src/lib/server/rofl/processing.ts)·[worker](../../apps/web/src/lib/server/rofl/processing-worker.ts)는 실제 작업 종료를 기다린다.
- **document:** 검증한 규칙을 [DESIGN.md](../../apps/web/DESIGN.md)·[sidecar](../../apps/web/.impeccable/design.json)와 웹 페이지/패턴/디자인 시스템·운영 문서에 병합했다. 새 정체성·디자인 토큰·성과 수치는 만들지 않았다.

## 코드 검사와 브라우저

| 검사 | 결과 |
| --- | --- |
| pnpm check | 포맷·브랜딩·웹/봇 타입 통과, Svelte 오류0/경고0 |
| pnpm check:tests | 통과 |
| pnpm test | 웹444·봇80 통과 |
| pnpm test:hard:db | 286/286 통과 |
| pnpm test:hard:http | 122/122 통과. 마지막 연결 입장503 보완 뒤 운영 DB5·HTTP2도 같은 최신 코드로 재검증 |
| pnpm test:browser | 22/22 통과. 마지막 취소 대진 문구/readonly 경계 추가 뒤 관련 lifecycle4도 재검증 |
| build | 웹·봇 통과, 마지막 UI 문구 뒤 웹 build·관련 브라우저 재검증 |
| 독립 코드 검토 | final_scope_review의 읽기 전용 P0/P1 검토에서 새 차단 문제0. 잠금/rollback·원자료 참조·풀 callback/Promise·worker 수명·시즌/늦은 응답 확인 |
| Impeccable audit | [최종 기술 감사](next-audit.md), [소스 detector](../../artifacts/ui-review/next/audit-detect.json): primary0, 기존 advisory27 |

사용 가능한 도구 목록에 Svelte 공식 MCP 플러그인은 없어 설치된 Svelte 공식 컴파일러·svelte-check와 설치 STDF의 실제 API/소스를 사용했다. 검토를 하지 않은 플러그인 검증으로 보고하지 않는다.

전체 게이트에서 발견한 테스트 문제도 고쳤다. 기존 중도 종료 테스트는 ORDER BY 없는 Match 배열 index를 계정 배열에 대응해 비결정적 실패가 났으며, 준결승 역순으로 재현한 뒤 실제 팀 ID로 고쳤다. 새 시즌 테스트의 Node/DB 시계1ms 차이는 DB의 `greatest(now(), started_at)`로 제거했다. 기존 순위 테스트는 새 시즌 쿼리를 허용하도록 href 전체 문자열 대신 URL pathname으로 선수를 확인한다. 파일명 표시와 숨긴 해제 레이블의 중복 탐색, fixed 자식 때문에 높이0인 dialog 호스트의 가시성 가정도 실제 조작 버튼·초기 포커스 기준으로 보완했다. 이 자동화 실패를 제품의 데이터 손실이나 새 시각 결함으로 세지 않았다.

## 실제 화면 증거

MCP의 공개 시즌33장·실제 관리자 취소/복구24장·취소 대진2장, Node Playwright의 ROFL 실패/재시도6장으로 after65장을 남겼다. before23장 중 hydration/media 전환 중 메뉴4장은 비교 부적합으로 분리했다. 나머지 before19장과 after65장은 실제 이미지를 읽었고 [전체 URL·상태·뷰포트·SHA·판독 담당자](../../artifacts/ui-review/next/screenshots.json)에 기록한다. 데스크톱 판독은 auction_profile/formation_records, 모바일·추가 폭·ROFL·대진은 root가 수행했다.

고정 개발 URL의 기존 기본 화면과 실제 업무 fixture는 구분한다. 격리 fixture를 다시 만들었으므로 일부 전후 UUID·loopback 포트는 다르며 같은 페이지 종류·상태·역할·뷰포트로 비교했다. 동일 운영 DB의 같은 행을 전후 촬영했다고 주장하지 않는다. fixture의 외부 이미지·폰트는 차단했으므로 자산 품질·글꼴·CDN 성능 판정으로 사용하지 않는다. 이미지 도구에서 반복 영역이 비어 보인4건은 실제 PNG 픽셀/해시로 내용 존재를 확인했다. fullPage 이미지의 fixed mask 경계도 레이아웃 결함과 구분했다. 모든 앱·schema·세션 fixture를 종료·정리했으며 사용자 개발 서버5173은 유지했다.

## 남은 범위

이번에 승인된 세 구현 항목의 미완료는 없다. 새 migration0008은 격리 DB에서만 적용·업그레이드 검증했고 사용자 개발/운영 DB에는 적용하지 않았다. 실제 적용 전 배포 문서의 migration·백업·재시작 절차가 필요하다.

약관·개인정보 본문은 사용자 보류다. 실제 Discord OAuth/명령 등록·게시/DM, 실 credential·실 League ROFL 원본·VPS/공인 TLS/운영 DB 복구, 물리 기기·Safari·실제 스크린리더 청취는 이번에 수행하지 않았다. 프로세스별 ROFL 제한은 분산 전역 quota가 아니며 worker heap 상한이 모든 ArrayBuffer 메모리를 포함하는 것도 아니다. 프런트 CWV·성능 개선율을 새로 측정하거나 주장하지 않았다. 정의되지 않은 평가 지표를 추가하지 않았다.
