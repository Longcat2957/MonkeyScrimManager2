# 남은 디자인·실제 기록 연결의 후속 결과

2026-11-14. 기준 커밋은 `249eeabd6786b9b9a56e5ec5208e0c207d087d36`이다. [전체 20페이지 검토](coverage.md)와 [앞선 6페이지 후속 개선](followup.md)을 이어서, 남아 있던 단계 대비·통계 조작 영역·실제 내전 기록 연결을 수정하고 검증 범위를 보완했다.

이번에 직접 UI 코드를 수정한 대상은 **모집 요약·통계·수동 편성·경매의 4페이지**다. 전체 20페이지를 이번에 다시 수정하거나 재촬영했다고 주장하지 않는다. 앞선 6페이지와 이번 4페이지에는 중복이 있으므로 합산해 새 페이지 수로 세지 않는다. 공개 조회·인증·권한·API·MMR·경기/세트 규칙과 기존 Slate·STDF·브랜드를 유지했다.

## 실행 작업표

| ID    | 범위·판단                               | 적용한 기능·실제 변경                                                                                                        | 완료 조건과 확인 결과                                                                                                                                                 |
| ----- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DQ-14  | P2 · 공통 내전 단계의 기존 낮은 대비    | `colorize/polish`: STDF 공개 색상 옵션이 없는 예정 단계만 `ScrimSummary` 안에서 기존 보조 글자 토큰으로 보완                 | 완료. 다섯 상태·두 폭·양 테마에서 현재의 채움, 예정의 윤곽/번호, 완료의 체크를 유지. 대표 예정 글자/번호 12표본의 최소 대비는 라이트 7.2486:1·다크 7.9554:1           |
| DQ-15  | P2 · 통계의 24px label 조작 영역        | `adapt/polish`: 기존 `최근 10게임만` label에 최소 높이 44px 적용                                                             | 완료. 실제 높이 24→44px. Firefox·WebKit에서 Space로 `recent=1` 전환, label 패딩 위치 클릭으로 해제. 새 조작·중복 설명 없음                                            |
| FN-01  | P2 · 수동 상세가 항상 빈 `pairs`를 사용 | `harden/clarify`: 같은 서버·고정 시즌·당시 사용자의 채택 ROFL에서 동팀 시너지와 같은 실제 포지션의 맞대결 연결               | 완료. 신규 DB 6개와 실제 업로드→수동 상세 회귀 통과. 취소·미완료 제외, 중도 종료의 유효 결과·진영·포지션·당시 귀속·좌우 관점 보존                                     |
| FN-02  | P2 · 실제 경매의 `openProfile:null`     | `harden/adapt/clarify/distill/polish`: 실제 후보의 내전 요약·주력 챔피언·확인된 포지션/게임을 제공하고 미확인·무기록 UI 보완 | 완료. 신규 프로필 8개+기존 경매 10개 DB 테스트 통과. 실제 후보의 1게임·챔피언·미확인 시각과 실제 취소 후 단일 무기록 안내를 브라우저·이미지로 확인                    |
| VR-01  | 변경 화면의 Chromium 외 엔진 미검증     | `adapt/audit` 관점의 실제 엔진 재검증                                                                                        | 범위 내 완료. Firefox·Linux Playwright WebKit에서 수동/통계 × 두 폭 × 양 테마 16조건 통과. 실제 Safari·물리 기기 검증과 구분                                          |
| VR-02  | 보조기기의 실제 생성 발화 미검증        | `audit` 관점의 실제 Orca·AT-SPI 경로 확인                                                                                    | 범위 내 완료. 격리 Orca가 문서·FAQ·앵커·모바일 메뉴·테마·Escape에서 생성한 발화 25개 기록. 음성 청취·보조기기 사용자 연구·NVDA/VoiceOver는 미검증                     |
| VR-03  | 정상 ROFL의 사용자 브라우저 경로 부족   | `harden`의 실패·복구·권한 경로 회귀 추가                                                                                     | 최종 회귀 2/2 통과. 실제 파일 선택/업로드, 중복 409, 관리자 취소, 동일 파일 복원, 다음 세트·BO 자동 완료를 확인. 전체 회귀 10/10 통과 |
| VR-04  | 실제 결과가 있는 화면의 성능 측정 부족  | `optimize`의 측정 단계 수행                                                                                                  | 범위 내 완료. 정상 2세트·10명 격리 fixture에서 5화면 × 3회=15회 측정. 새 병목을 확정하지 않아 성능 코드는 추가하지 않음. 실서비스 CWV·INP·전후 개선율은 미검증        |
| POL-01 | `/terms`, `/privacy`의 정책 본문        | 사용자 확인: **아직 미확정—보류**                                                                                            | 사용자 보류 유지. 승인된 본문 없이 정책을 작성하거나 콘텐츠 개선 완료로 계산하지 않음. 기존 공통 프레임은 유지                                                        |

DQ-14는 기존 advisory를 이번에 처리한 것이며 도입 시점이 불명확한 문제를 이번 변경의 회귀로 세지 않는다. 보조기기용 숨긴 단계 목록을 시각 대비의 대체 해결로 취급하지 않았다.

## 변경 파일과 보존한 의미

### 단계·통계

- [ScrimSummary.svelte](../../apps/web/src/lib/components/scrims/ScrimSummary.svelte): `.scrim-steps` 안에만 예정 단계의 글자·번호·경계 토큰을 적용했다. 공통 STDF 컴포넌트를 복제하거나 전역 테마를 바꾸지 않았다.
- [통계 페이지](../../apps/web/src/routes/g/[guildId]/stats/+page.svelte): 기존 Switch를 감싼 label의 조작 높이만 늘렸다. 옆 버튼이 이미 만들던 44px 행을 사용해 주변 배치·줄바꿈을 유지했다.

모집·편성·대진 준비·진행·완료의 실제 샘플 URL은 [전후 manifest](../../artifacts/ui-review/remaining/after/ui.json)에 있다. 대표 경로는 `/g/devGuild001/scrims/devScrim001`, `devScrim007`, `devScrim008`, `devScrim004`, `devScrim005`와 `/g/devGuild001/stats`다. [독립 이미지 읽기와 대비 원값](../../artifacts/ui-review/remaining/ui-visual.md), [48장 해시](../../artifacts/ui-review/remaining/ui-proof.json)를 함께 보존했다.

### 수동 상세의 실제 전적

[manual.ts](../../apps/web/src/lib/server/scrims/manual.ts)와 새 [formation-records.ts](../../apps/web/src/lib/server/scrims/formation-records.ts)가 기존 공개 읽기 트랜잭션에서 필요한 사용자 집합의 실제 기록을 한 번에 집계한다. [공유 편성 타입/함수](../../apps/web/src/lib/features/scrims/formation.ts)의 선택적 `againstByLane`와 [FormationHeadToHead](../../apps/web/src/lib/components/teams/FormationHeadToHead.svelte)를 연결해 현재 자리와 같은 실제 출전 포지션의 맞대결만 표시한다. 기존 목 자료에는 이전 동작을 유지한다.

완료 Game·채택 ROFL·취소되지 않은 부모·현재 내전에 고정한 시즌·당시 `scrimParticipants.userId`가 집계 원천이다. 현재 계정 소유자·희망 위치·현재 팀 배정으로 과거 기록을 재귀속하지 않는다. 서로 다른 진영이더라도 실제 출전 포지션이 다르면 같은 라인 맞대결로 세지 않는다. 조회 실패를 빈 기록으로 숨기지 않는다.

준용 기준은 MSM1 pin `d60df685e48c180b236342eae81b389ae87e38bf`의 실제 HEAD_TO_HEAD·DUOS 구현이다. MSM1 시너지가 이미 실서버에 연결됐다고 주장하지 않으며, 기존 동팀 DUOS 계산과 MSM2의 같은 유효 ROFL 원천을 근거로 연결했다. [근거·제약·신규 DB 6개](../../artifacts/ui-review/remaining/formation.md), [source SHA](../../artifacts/ui-review/remaining/formation.json)를 따른다.

### 경매 후보의 실제 프로필

[auction.ts](../../apps/web/src/lib/server/scrims/auction.ts)와 새 [auction-profile.ts](../../apps/web/src/lib/server/scrims/auction-profile.ts)가 현재 후보 한 명의 실제 프로필을 준비한다. 기존 [production loader](../../apps/web/src/routes/g/[guildId]/scrims/[scrimId]/auction/+page.server.ts)에서 기존 Data Dragon resolver를 선택 인자로 주입한다. 새 외부 endpoint·schema·캐시를 만들지 않았다.

MSM1의 실제 프로필·챔피언·게임 조회를 확인해 상위 3개 챔피언·최대 8개 게임을 제공한다. 요약은 전체 유효 기록을 유지한다. 주력 포지션은 기존 개인 전적과 같은 실제 최다 출전 위치이며, 확인할 수 없으면 `null`이다. 실제 시각이 하나라도 없으면 최근 순서를 추정하지 않는다. 외부 Riot 티어·선호 챔피언을 내전 기록에서 만들어 채우지 않는다. [실제 근거·집계·18개 DB 회귀](../../artifacts/ui-review/remaining/auction.md), [source SHA와 명령](../../artifacts/ui-review/remaining/auction-validation.json)을 따른다.

[AuctionDraftBoard](../../apps/web/src/lib/components/teams/AuctionDraftBoard.svelte)와 [AuctionTargetProfile](../../apps/web/src/lib/components/teams/AuctionTargetProfile.svelte)은 희망과 실제 주력을 구분한다. 미확인 위치의 임의 `mid` 기본값을 제거하고 대표 MMR은 `-`로 남긴다. 알 수 없는 시각은 `게임 기록`·`시각 미확인`으로 표현한다. 무기록은 단일 안내로 표시하고, 없는 챔피언/게임/선호/Riot 영역을 생성하지 않는다. 모바일 MMR은 실제 너비에 따라 줄을 바꾸며 상세 스크롤에 이름과 키보드 진입점을 제공한다.

## 실제 브라우저 과업과 추가 시각 증거

새 [formation-records.test.ts](../../apps/web/tests/browser/formation-records.test.ts)는 출전자 인증의 기존 upload action으로 parser를 통과한 합성 ROFL2를 저장한다. 같은 수동 상세에서 양 팀의 시너지 6개·동포지션 맞대결 5개를 확인한 뒤, 같은 서버·고정 시즌·기존 사용자로 준비한 다른 내전의 기존 setup/start/draw action을 실행한다. 현재 후보의 실제 1게임·승패·저장 챔피언·미확인 시각이 화면까지 연결됐다. [단일 기능 회귀 1/1](../../artifacts/ui-review/remaining/feature-browser.md), [명령·검사·한계](../../artifacts/ui-review/remaining/feature-browser.json)를 보존했다.

유지 테스트를 수정하지 않는 임시 capture 계측으로 같은 실제 데이터 흐름을 두 폭·양 테마에서 촬영했다. 관리자가 실제 UI의 마지막 세트 취소를 확인한 뒤 같은 후보를 다시 열자 무기록 안내 한 번·다섯 라인 MMR 1,500·미확인 주력 위치가 나타났다. 모든 10장을 직접 읽었다. [이미지 관찰과 전체 링크](../../artifacts/ui-review/remaining/feature-visual.md), [URL·테마·이미지 크기·SHA](../../artifacts/ui-review/remaining/feature-visual.json)를 따른다.

새 [rofl-results.test.ts](../../apps/web/tests/browser/rofl-results.test.ts)는 1440×1000·390×844의 실제 파일 선택·multipart 업로드·중복 실패·취소·복원·같은 라인업의 2세트와 시리즈 자동 완료를 검증한다. [과업·권한·데이터 확인](../../artifacts/ui-review/remaining/validation.md)의 정상 ROFL 절을 따른다. 합성 ROFL2 fixture이며 실서비스 클라이언트에서 새로 받은 파일·실제 OAuth 제공자 검증과 구분한다.

### 새 스크린샷 77장의 구성

| 묶음                | 수  | 실제 읽기·해시 근거                                                                                                                          | 대표 이미지                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 단계·통계의 전후    | 48  | before 24 + after 24. 단계 crop 40장·통계 viewport 8장. [ui-proof.json](../../artifacts/ui-review/remaining/ui-proof.json)                   | [예정 단계 전](../../artifacts/ui-review/remaining/before/steps-preparing-primary-mobile.png)·[후](../../artifacts/ui-review/remaining/after/steps-preparing-primary-mobile.png), [통계 전](../../artifacts/ui-review/remaining/before/stats-dark-mobile.png)·[후](../../artifacts/ui-review/remaining/after/stats-dark-mobile.png)           |
| 실제 전적 UI        | 10  | 수동·경매 × 두 폭 × 양 테마 8장 + 취소 후 모바일 양 테마 2장. [feature-visual.json](../../artifacts/ui-review/remaining/feature-visual.json) | [수동](../../artifacts/ui-review/remaining/after/feature-manual-records-dark-mobile.png)·[1게임 경매](../../artifacts/ui-review/remaining/after/feature-auction-records-primary-mobile.png)·[취소 후](../../artifacts/ui-review/remaining/after/feature-auction-zero-after-revert-dark-mobile.png)                                            |
| 엔진·Orca·정상 결과 | 19  | Firefox/WebKit 16장 + Orca 메뉴 1장 + 정상 결과의 경기/선수 2장. [proofs.json](../../artifacts/ui-review/remaining/validation/proofs.json)   | [Firefox](../../artifacts/ui-review/remaining/validation/manual-firefox-dark-390.png)·[WebKit](../../artifacts/ui-review/remaining/validation/stats-webkit-primary-390.png)·[Orca 메뉴](../../artifacts/ui-review/remaining/validation/orca-menu.png)·[정상 경기](../../artifacts/ui-review/remaining/validation/valid-rofl-match-mobile.png) |

이 77장은 과거 전체 20페이지·80조건이나 앞선 6페이지 후속의 이미지와 별도다. 단계 crop을 전체 페이지 검토로, 같은 화면의 상태·테마·역할을 새 페이지로 중복 계산하지 않는다. 최초 다크 통계 2개 캡처의 불완전한 그리기는 같은 파일을 재촬영·직접 읽어 교체했으며 별도 이미지 수로 더하지 않는다.

## 검증 범위와 남은 경계

- **다른 엔진:** [cross-engine.json](../../artifacts/ui-review/remaining/validation/cross-engine.json)의 16조건 모두 HTTP 200·단일 h1·가로 넘침 0·JS 예외 0·POST 0이다. Linux Playwright WebKit 실행에 필요한 라이브러리는 `/tmp`에서만 준비했으며 프로젝트 의존성·시스템 패키지를 바꾸지 않았다. 실제 macOS/iOS Safari나 물리 터치 장치의 검증은 남아 있다.
- **Orca:** [orca.json](../../artifacts/ui-review/remaining/validation/orca.json)은 실제 AT-SPI 이벤트로 생성한 발화 25개를 기록한다. 메뉴 안의 포커스·배경 inert·테마 이름 변화·Escape 복귀를 확인했다. dummy speech backend이므로 음성의 명료성·사용자의 실제 과업 성공·NVDA/VoiceOver·점자는 미검증이다.
- **성능:** [performance.json](../../artifacts/ui-review/remaining/validation/performance.json)의 15회는 390×844·매회 새 context·warm 로컬 앱·외부 origin 차단·인위적 CPU/네트워크 제한 없음이다. 5화면의 TTFB 중앙값 4.3~21.7ms, LCP 중앙값 76~112ms, CLS 최대 0.005634를 이 조건의 원값으로만 기록한다. 실제 배포 전송량·실기기 CWV/INP·이전 대비 개선율로 읽지 않는다.
- **외부 자산·서비스:** 실제 세션 fixture는 외부 웹폰트·장식 이미지를 차단하므로 fallback 폰트와 실패한 이미지가 보인다. 이 이미지를 브랜드 폰트·CDN 로딩 품질의 증거로 사용하지 않는다. 실서비스 DB·Discord·Riot 쓰기와 DM 발송은 0이며, 실제 자격증명·쿠키·세션 값은 증거에 남기지 않았다.
- **정책:** 사용자가 약관·개인정보 본문을 **아직 미확정—보류**로 확인했다. POL-01은 사용자 보류이며 승인 콘텐츠가 준비되기 전까지 남긴다.
- **기존 예외:** GameHero의 승리 진영 경계는 기존 파일 한정 `side-tab` 예외만 유지한다. Codex의 도메인 표현 판단이며 사용자 확인을 받은 디자인으로 바꾸어 기록하지 않는다. [이전 분류](../../artifacts/ui-review/hook-triage.json)를 보존했고 이번 새 ignore는 0이다.

## 최종 코드 게이트

최종 전체 실행값은 아래와 같다. 신규 DB 14개와 브라우저 3개를 포함하며 건너뜀은 0이다. HTTP hard 전체를 이번에 다시 실행한 것으로 합산하지 않는다. 실행·소스 지문은 [checks.json](../../artifacts/ui-review/remaining/checks.json)에 기록한다.

| 명령·범위                              | 실행 범위                                           | 최종 결과        |
| -------------------------------------- | --------------------------------------------------- | ---------------- |
| `pnpm check`                           | 포맷·브랜딩·봇 TypeScript·Svelte                    | 통과: Svelte 0오류·0경고 |
| `pnpm check:tests`                     | 웹·봇 테스트 TypeScript                             | 통과 |
| `pnpm build`                           | 웹·봇 production build                              | 통과 |
| `pnpm test`                            | 웹 415개·봇 65개                               | 통과 |
| `pnpm test:hard:db` | 격리 DB 224개                                  | 통과 |
| `pnpm test:browser` | 기존 7 + 정상 ROFL 2 + 실제 편성/경매 1 = 10개 | 통과 |

전체 페이지·역할의 누적 대상은 [coverage.md](coverage.md), 앞선 진단/수정은 [report.md](report.md)와 [followup.md](followup.md)를 따른다. 이 문서는 이번 남은 작업의 코드·실제 데이터 연결·추가 검증과 명시적 보류를 이어갈 수 있도록 기록한다.

Impeccable `document`로 [DESIGN.md](../../apps/web/DESIGN.md)와 schema2 [sidecar](../../apps/web/.impeccable/design.json)에 실제 적용 규칙을 병합했다. `doctor --target apps/web`는 findings 0·규칙 레지스트리 확인 가능이며, 최종 detector는 primary 0·기존 advisory 27개다. 새 ignore 없이 기존 도메인 표현과 조밀한 보조 글자 예외를 유지했다. Svelte 공식 플러그인의 도구는 세션에 노출되지 않아 설치된 공식 컴파일러·svelte-check로 검사했다.

최종 [77장 이미지 색인](../../artifacts/ui-review/remaining/images.json)과 [전체 결과 색인](../../artifacts/ui-review/remaining/summary.json)의 SHA를 현재 파일과 대조했다. 별도 제품 로드맵의 경매 전체 행위 취소·시즌 운영·내전 취소 복구·실시간 갱신·출시 운영은 이번 UI 후속 작업의 미완료로 합산하지 않고 기존 계획에 남긴다.
