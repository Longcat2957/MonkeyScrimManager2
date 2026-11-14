# 남은 디자인 문제의 수정·재검증

2026-11-14. 기준 커밋은 `15c962ddb0453ac73d8f68b05891c11f157ab754`다. [앞선 재평가](recheck.md)에서 부분 충족으로 남긴 **6페이지·DQ-01~07과 추가 발견08~13을 실제 코드에서 수정·재검증했다**. 전체20개 대상·20개 검토를 기반으로 이번6개를 수정·재검증했으며, 기존 개선과 중복 집계하지 않는다. 브랜드·STDF·공개 조회·권한·API·데이터 계산·시리즈/세트 규칙을 유지한다.

## 실행 목록

| ID | 범위·우선순위 | 적용 기능과 변경 | 완료 조건·현재 확인 |
| --- | --- | --- | --- |
| DQ-01 | 수동 편성·P2 | `layout/adapt/harden`: 기존 단일 선택 안내를 헤더 아래 고정, 작업판 clipping과 키보드 스크롤 여백 보완 | 완료. 선택→둘째 팀 이동→배치/교환·취소에서 사람과 대상의 맥락 유지 |
| DQ-02 | 통계·P2 | `typeset/adapt/polish`: 작은 얼굴과 전체 이름 줄바꿈, 단일 프로필 링크의 조작 영역 확보 | 완료. 320/390/768/1440px·양 테마, 같은 접두어의 한/영 이름 식별, 고정 열·일곱 지표·112정렬·키보드/터치 유지 |
| DQ-03 | 홈·P2 | `onboard/clarify/layout`: 실제 로그인/서버 상태별 시작 안내와 기존 헤더 로그인 강조. 소개와 운영 흐름을 구분 | 완료. 비로그인·로그인·빈 서버·조회 실패의 다음 행동과 단일 조작, 격리 실제 세션12조건 |
| DQ-04 | 수동 편성·P2 | `adapt/polish`: STDF Button 공개 옵션으로 실제 배정 해제 버튼 최소 44×44px | 완료. 모든 배정 자리·선택 상태의 실제 버튼과 터치 해제 확인 |
| DQ-05 | 선수·P3 | `layout/adapt`: 기존 MMR을 핵심 지표 다음 DOM 영역으로 이동, 데스크톱 첫 행 오른쪽에 배치 | 완료. 8조건·이미지 실제 읽기, 모바일 MMR이 챔피언/기록보다 먼저 표시, 15지표 펼침·필터와 무관한 MMR 유지. [근거](../../artifacts/ui-review/followup/player.json) |
| DQ-06 | 이용 안내·P2 | `distill/layout/onboard`: 참가·기록 / 운영하기로 단일 목차와 본문을 함께 재배치 | 완료. 기존 6앵커·필수 규칙 보존, 48개 목차 Enter 경로·포커스·헤더 가림 없음 |
| DQ-07 | 모집 요약·P3 | `layout`: 운영자는 운영→참가자→내 신청·편성 방식, 참가자는 내 신청→참가자 | 완료. 같은 참가자 관리 조작을 한 번만 제공하고 DOM·읽기·키보드 순서 일치, 참가자·정원마감·종료 유지 |

## 후속 검증에서 직접 발견한 문제

- **DQ-08 · P2 · 참가자 관리**: 같은 tick의 대기 연속 클릭이 2POST를 전송했다. 관리 중 선택·작업을 native fieldset으로 잠그고 함수의 pending 가드와 finally를 추가했다. 실패 때 선택·현재 화면·포커스를 유지한다. 설치 STDF List는 각 사람의 체크 표시와 행을 별개 선택 버튼으로 노출하고 일괄 작업 높이가 20px였다. 공개 크기 옵션과 이 사용처에 한정한 attachment로 행 하나에 선택 상태를 제공하고 체크 표시는 장식으로 처리했다. 320px 관리 행은 이름 공간이 부족해 관리 컨테이너가 20rem 미만일 때 이름·Riot ID를 첫 줄에, 포지션·상태를 둘째 줄에 둔다. 8조건의 실제 1POST·실패 선택/포커스 보존·44px·11개 단일 행·전체선택/완료 복귀와 일반 이름의 가독성을 확인했다. 적용: `harden/layout/adapt/polish`.
- **DQ-09 · P2 · 통계 챔피언 표**: 320px에서 `111`·`2.19`가 중간 줄바꿈됐다. 숫자의 줄바꿈을 막고 최소 표 너비·이름 있는 키보드 가로 스크롤을 제공한다. 열·값·정렬 의미는 유지한다. 네 폭·양 테마에서 45개 수치가 한 줄이며 페이지 넘침이 없음을 확인했다. 적용: `typeset/adapt/harden`.
- **DQ-10 · P3 · 공유 헤더**: 실제 로그인 세션에서 데스크톱 로그아웃 버튼이 40px이었다. 기존 STDF Button의 공개 `injClass`에 최소 높이 44px을 적용하고 최신 빌드의 실제 세션 12조건을 다시 촬영했다. 데스크톱 세 상태·양 테마에서 44px을 확인했다. 모바일 닫힌 메뉴의 내부 버튼을 이 측정으로 확인했다고 주장하지 않는다. 적용: `adapt/polish`.
- **DQ-11 · P2 · 수동 편성**: 320px 및 두 팀 열이 시작하는 640px에서 MMR 보조 줄의 말줄임이 중요한 `희망 외` 상태까지 숨겼다. 보조 줄의 말줄임을 제거하고 16px 행간으로 기존 76px 자리에 줄바꿈한다. 선택·교환 대상에는 사용하지 않는 해제 열도 예약하지 않아 사람·수치·상태의 공간을 확보한다. 실제 기본·선택/교환·재선택 취소·읽기 전용에서 이름·수치·상태와 76px 행을 보존했다. 적용: `typeset/layout/adapt/harden`.
- **DQ-12 · P3 · 선수 플레이 성향**: 기존 상위 % 값과 축 방향이 SVG title·숨긴 목록에만 있어 터치에서 그래프를 해석하기 어려웠다. 이미 계산한 여섯 detail 값을 축 이름 아래 표시하고 기존 figcaption에 방향을 한 번 설명한다. 지표·값·축·계산은 바꾸지 않았다. 독립 비평에서 1440/390/320px·양 테마의 겹침·잘림 없이 의미를 읽을 수 있음을 확인했다. 적용: `clarify/typeset/adapt`.
- **DQ-13 · P2 · 통계 키보드 이동**: 실제 Tab 경로에서 `게임`·`피해/분` 정렬 버튼의 일부가 오른쪽 경계에 가려졌다. CSS 여백만으로는 해결되지 않아 고정 이름 열 너비+8px의 scroll-padding과 열 머리의 focusin `scrollIntoView(nearest, instant)`를 함께 적용했다. 320/390/640px·양 테마의 Tab/Shift+Tab 78표본이 이름 열·오른쪽 경계·공유 헤더에 가려지지 않고, 정렬·포커스·수동 가로 스크롤을 유지했다. 부분 가림을 WCAG AA 실패로 단정하지 않는다. 적용: `adapt/harden/polish`.

추정 성능 병목·개선율을 추가하지 않는다. 약관·개인정보 정책 본문은 승인된 콘텐츠가 없어 기존 보류를 유지한다. 실제 외부 OAuth·실운영 쓰기·실기기·Safari·스크린리더 전수 검증은 범위 밖이다.

## 실제 변경 파일·기능의 선택

| 과업 | 관련 파일(apps/web 기준) | 선택한 기능과 이유 |
| --- | --- | --- |
| 시작·찾기 | `src/routes/+page.svelte`, `src/routes/docs/+page.svelte`, `src/lib/components/layout/AppHeader.svelte` | `onboard/clarify/bolder`: 실제 시작점과 상태별 다음 행동. `layout/distill/typeset`: 안내와 과정의 구분, 역할별 목차·본문, 제목/설명 위계. 개발14경로도4과업으로 정리 |
| 참가·편성 | `src/routes/g/[guildId]/scrims/[scrimId]/+page.svelte`, `src/lib/components/scrims/ParticipantBoard.svelte`, `src/lib/components/teams/{ManualFormationBoard,FormationTeamCard}.svelte` | `layout/adapt/harden/polish`: 역할별 순서, 단일 선택 문맥·작은 자리·실제 버튼 크기, 중복 조작/요청·실패 입력/포커스 보존 |
| 실력·비교 | `src/routes/g/[guildId]/players/[userId]/+page.svelte`, `src/lib/components/players/RadarChart.svelte`, `src/lib/components/stats/LeaderboardTable.svelte`, `src/routes/g/[guildId]/stats/+page.svelte` | `layout/typeset/clarify/adapt/harden`: MMR 우선, 실제 이름·숫자·상태 보존, 그래프 해석, 키보드 초점의 온전한 표시 |

기존 공통 ParticipantBoard·FormationTeamCard·STDF 조작을 먼저 사용했다. 역할별 동일 참가자 패널의 조립은 snippet 한 곳에 두고 동시에 두 번 렌더링하지 않는다. 관찰한 중복을 없앤 범위만 정리했으며 전역 STDF 래퍼를 새로 만들지 않았다. 추가 장식·새 모션·성능 개선율을 목표로 삼지 않는다.

검증된 규칙은 [DESIGN.md](../../apps/web/DESIGN.md)와 schema2 sidecar에 병합하고 [전역 화면](../web/pages/global.md)·[내전](../web/pages/scrims.md)·[기록](../web/pages/records.md)·[디자인 시스템](../web/design-system.md)을 실제 코드에 맞췄다. 기존 Slate 토큰·브랜드·제품 정책은 유지한다.

## 검사 결과

- `pnpm test`: 웹415·봇65 통과.
- `pnpm check:tests`: 웹·봇 테스트 TypeScript 통과.
- `pnpm build`: 웹·봇 통과. 마지막 source의 웹 빌드도 다시 통과했다.
- `pnpm --filter @msm2/web check`: 최종 Svelte0오류·0경고. 실제 사용할 수 있는 공식 Svelte MCP 검사 도구는 없어 공식 문서와 설치 compiler/check를 사용했다.
- `pnpm test:browser`: 최종 source로 새 production build 후 격리 DB·실제 세션의 기존7개 회귀 통과.
- `git diff --check`: 통과. doctor는 apps/web 대상으로 findings0, rule registry 확인 가능.
- 전체20URL·1440×1000/390×844·양테마80조건의 DOM 감사: h1하나·중복ID/보이는중복링크/브랜드오류/가로넘침/JS예외0. 이를 실제 이미지 읽기나 시각 품질의 대체 근거로 세지 않는다.
- 최종 전체 `pnpm check` 통과: Prettier·브랜딩·봇 TypeScript·Svelte0오류/0경고. 최종11소스 지문·직접 읽은267개 전후 이미지 해시·문서 상대 링크를 대조했다. 세부 결과는 [checks.json](../../artifacts/ui-review/followup/checks.json)·[전체 증거 색인](../../artifacts/ui-review/followup/summary.json)을 따른다.

## 최종 독립 비평·감사

Method: dual-agent (A: `/root/final_design` · B: `/root/final_technical`). A는 detector·B·이전 점수/진단을 읽지 않고 source와 신규 탭의 실제 이미지를 보았다. A 완료 뒤 B를 합성했으며 B는 A 결과를 보지 않았다. A의88장·B의17장 실제 읽기와 source 지문을 보존한다. B가 마지막에 찾은 DQ-13은 코드 수정 후78포커스 표본으로 다시 확인했다.

[최종 합성 비평](followup-critique.md)의 A 휴리스틱31/40 Good·B 기술표본15/20 Good은 서로 다른 평가이며 합산하거나 이전20페이지와 개선율로 비교하지 않는다. DQ-01~07과 추가08~13의 완료 조건을 충족했다. 이번 실제 검사 범위 안에 새 미해결 우선 문제는 남기지 않았으나 전체 상태·모든 사용자·접근성/성능의 완벽함을 뜻하지 않는다.

기존 공통 Steps의 미래 단계 runtime 대비2그룹(2.1:1/1.9:1)은 standing advisory로 남긴다. 도입 시점은 미확인이고 이번 변경의 회귀로 세거나 공통 Steps 재설계로 확대하지 않았다. CLI27 advisory는 기본색 템플릿1·제한된 기존 보조크기24·경매 완료easing2이며 세부 triage와 대비 표본의 한계는 [B 보고서](../../artifacts/ui-review/followup/critique/technical.md)를 따른다. ‘최근10게임만’ Switch는 label로 실제 이름이 있어 unnamed 오탐이지만24px label을 전체44px 인증으로 확대하지 않는다. GameHero 진영 표시의 기존 파일 한정 side-tab 예외만 유지했고 **새 억제는0**이다.

약관·개인정보2페이지의 승인 본문, 서버 순위의 기존 bounded 목록 부분 행, 실제 OAuth·실운영 쓰기·실기기·Safari·스크린리더·CWV는 후속 또는 미검증이다. 보조기기용 숨긴 단계 목록이 시각 대비를 해결한다는 주장도 하지 않는다.

## 증거 색인

- 공개 홈·안내: [시각·동작·실제세션](../../artifacts/ui-review/followup/public/validation.json), [전후52장·해시](../../artifacts/ui-review/followup/public/proofs.json), [비평과 한계](../../artifacts/ui-review/followup/public/notes.md).
- 모집 요약·수동: [상태·동작·실패·복원](../../artifacts/ui-review/followup/workflow/validation.json), [전후이미지·해시](../../artifacts/ui-review/followup/workflow/proofs.json), [비평과 한계](../../artifacts/ui-review/followup/workflow/notes.md).
- 통계 이름·수치: [8조건·112정렬·키보드/터치](../../artifacts/ui-review/followup/data/validation.json), [전후24장·해시](../../artifacts/ui-review/followup/data/proofs.json), [비평](../../artifacts/ui-review/followup/data/notes.md). 이름 검증 뒤 추가한 DQ-13의 최종 source·포커스는 아래 B 근거를 따른다.
- 선수: [8조건·15지표·MMR·레이더·최종이미지](../../artifacts/ui-review/followup/player.json).
- 최종 독립평가: [A88장](../../artifacts/ui-review/followup/critique/screenshots-a.json), [A비평](../../artifacts/ui-review/followup/critique/design.md), [B표본·overlay·78포커스·17장·최종source](../../artifacts/ui-review/followup/critique/browser-b.json), [CLI원본](../../artifacts/ui-review/followup/critique/detector.json).
- 전체20페이지: [80조건DOM](../../artifacts/ui-review/followup/all-routes.json), [코드검사·테스트·최종11소스지문](../../artifacts/ui-review/followup/checks.json), [doctor](../../artifacts/ui-review/followup/doctor.json). 실제 전체 URL·역할·전후 기본 이미지는 [coverage](coverage.md).

Impeccable 로컬 critique snapshot은 `2026-11-14T09-21-46Z__apps-web-src.md`에 저장했다. 같은 slug의 이전31/40은 전체20페이지를 평가했으므로 두31을 같은 범위의 점수 추세로 읽지 않는다. Questions skipped: 사용자가 코드·문서에 근거한 자율 수정과 재검증을 명시했고 추가 제품 결정을 요구할 상태가 없다.
