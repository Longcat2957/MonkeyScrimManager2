# Assessment B — 독립 기술 진단

검토자: `/root/final_technical`. Assessment A의 결과·점수·이미지·보고서를 읽지 않았다. A 완료 통지를 받은 뒤에만 부모에게 B 결과를 전달했다. Impeccable context는 부모가 이번 세션에서 실행했으므로 다시 실행하지 않았다.

대상은 `apps/web/src` 전체 CLI와 이번 후속의 여섯 화면(`/`, `/docs`, 내전 요약, 수동 편성, 선수 전적, 서버 통계) 및 변경된 공유 컴포넌트다. 판단 기준은 AGENTS.md, apps/web/PRODUCT.md·DESIGN.md, docs/web/design-system.md·patterns.md와 critique B·audit 지침이다. 이 검토자는 UI 소스·권한·API·목 데이터·ignore 설정을 수정하지 않았다.

## 판정과 점수

현 수정 범위의 구현은 기존 STDF/Slate 체계, 실제 업무 흐름, 이름·상태·네이티브 조작 의미를 유지한다. B가 찾은 정렬 머리의 키보드 가림 1건은 부모가 같은 컴포넌트 안에서 보완했고 최종 소스로 재검증했다. 아래 점수는 선정한 화면·상태의 기술 진단이며 전체 서비스의 접근성 인증이나 성능 등급이 아니다.

| 차원 | 점수 /4 | 근거와 제한 |
| --- | --- | --- |
| 접근성 | 3 | 이름·선택·정렬 상태, 차트 수치 대안, 메뉴 배경 차단·복귀, 실제 키보드 초점 확인. 기존 미래 단계의 시각 대비는 standing advisory이며 실기기 스크린리더 발화는 미검증. |
| 성능 | 3 | 변경 범위는 주로 배치·의미 보완이다. 큐·observer 해제·키 있는 행 구조를 확인했으며 새 과도한 렌더링 효과는 확인하지 못했다. 실제 CWV·프레임·번들 비교를 수행하지 않아 개선율이나 최고점은 주장하지 않는다. |
| 테마 | 3 | primary/dark 토큰, 워드마크·본문 글꼴, 실제 모드 변경, 선택 대비 표본 확인. 투명·이미지 중첩을 포함한 전체 색 조합은 미검증. |
| 반응형 | 3 | 기본 12조건과 최종 좁은 폭 8조건, 실제 Tab·Shift+Tab·가로휠·키보드 스크롤 확인. 물리 기기와 B 자체의 합성 터치는 미검증. |
| 구현 무결성 | 3 | STDF 공개 조작을 유지하고 필요한 네이티브 표·버튼·SVG만 보완한다. 단일 선택 행과 inert 장식, 명시적 정렬 상태가 일관된다. CLI advisory와 기존 공통 단계 표현의 제한을 남긴다. |
| 합계 | **15/20** | **Good** — 표본 범위의 일관된 구현, 별도 보증이 필요한 잔여 한계 유지 |

## 건수의 구분

- 최종 범위 내 미해결 확인 문제: **P0 0 / P1 0 / P2 0 / P3 0**.
- B에서 확인하고 이번 범위 안에서 해결한 문제: **P2 1건**(리더보드 정렬 머리의 키보드 부분 가림). 회귀 도입 시점은 확인하지 않았다.
- CLI: **27 advisory / 3규칙 / 16파일**, non-advisory 0. exit **0**, stderr 없음. advisory가 남아 있으므로 결과를 “아무 신호도 없음”으로 표현하지 않는다.
- 브라우저 runtime: 문서 0, 수동 편성 2 low-contrast 그룹, 통계 0. 수동 편성의 2그룹은 이번에 바꾸지 않은 공통 Steps의 standing 신호이며 신규 회귀 건수에 합산하지 않는다.
- 단순 DOM 이름 휴리스틱이 stats Switch를 unnamed로 기록한 2표본은 실제 접근성 이름 계산으로 해소한 오탐이다. CLI finding이 아니다.

## CLI 결과와 triage

명령: `.agents/skills/impeccable/scripts/impeccable detect --json apps/web/src`.
최종 LeaderboardTable·ParticipantBoard freeze 뒤 실행했다. 원본 결과는 `detector.json`, 최종 소스 SHA-256·exit와 이전 freeze 전 스캔은 `browser-b.json.detector`에 보존했다.

| 규칙 | 건수 | triage |
| --- | --- | --- |
| design-system-color | 1 | app.html:0의 body 기본 rgb(0,0,0) 신호. 이 파일에는 해당 색 리터럴이 없으며 실제 색은 layout.css의 html 테마 토큰에서 상속한다. `%sveltekit.*%` 템플릿의 원시 렌더링 신호로 분리하고 제품 팔레트 회귀로 세지 않는다. |
| design-system-font-size | 24 | 8/10/11/13px의 기존 조밀한 보조 표현. DESIGN.md Typography와 디자인 시스템 3절이 날짜·얼굴 수·MMR·차트·표·시너지·Loadout 대체 표시의 제한된 사용을 명시한다. 정적 frontmatter 기본 램프 밖인 것은 사실이므로 신호를 보존하되 새 결함으로 일괄 집계하지 않는다. 실제 크기의 전수 가독성을 인증한 것은 아니다. |
| bounce-easing | 2 | AuctionTeamCard의 한 번 실행하는 기존 낙찰/배치 표현. reduced-motion에서 confetti·member-pop·flash를 끄고 stamp-still로 상태를 남기는 구현을 확인했다. 반복·자동 애니메이션 위반이나 새 회귀로 단정하지 않는다. |

| 규칙 | 파일(apps/web 기준) | 줄 | 건수 |
| --- | --- | --- | --- |
| `design-system-color` | `src/app.html` | 0 | 1 |
| `design-system-font-size` | `src/lib/components/common/AvatarStack.svelte` | 82 | 1 |
| `design-system-font-size` | `src/lib/components/common/DateBadge.svelte` | 14, 21 | 2 |
| `design-system-font-size` | `src/lib/components/guild/NextScrimHero.svelte` | 108 | 1 |
| `design-system-font-size` | `src/lib/components/guild/RankingBoard.svelte` | 146 | 1 |
| `design-system-font-size` | `src/lib/components/matches/GameTeamTable.svelte` | 93, 121 | 2 |
| `design-system-font-size` | `src/lib/components/matches/LoadoutIcon.svelte` | 30 | 1 |
| `design-system-font-size` | `src/lib/components/players/RadarChart.svelte` | 66 | 1 |
| `design-system-font-size` | `src/lib/components/stats/LeaderboardTable.svelte` | 116 | 1 |
| `design-system-font-size` | `src/lib/components/teams/AuctionDraftBoard.svelte` | 372, 457 | 2 |
| `design-system-font-size` | `src/lib/components/teams/AuctionTargetProfile.svelte` | 54, 72, 89, 127, 146 | 5 |
| `bounce-easing` | `src/lib/components/teams/AuctionTeamCard.svelte` | 237, 243 | 2 |
| `design-system-font-size` | `src/lib/components/teams/FormationHeadToHead.svelte` | 35, 65 | 2 |
| `design-system-font-size` | `src/lib/components/teams/FormationSynergyRail.svelte` | 59, 69 | 2 |
| `design-system-font-size` | `src/lib/components/teams/FormationTeamCard.svelte` | 62, 103 | 2 |
| `design-system-font-size` | `src/routes/g/[guildId]/players/[userId]/+page.svelte` | 291 | 1 |

기존 `.impeccable/config.json`은 `GameHero.svelte`에만 `side-tab:*` 예외를 둔다. 실제 `winner.side`에 따라 info/error 경계와 “블루/레드 · 팀 승리” 문구를 함께 표시하는 도메인 의미를 확인했다. 이 파일 한정 예외는 유지했고 새 ignore를 추가하지 않았다. config SHA-256은 `364e679339f7f025b563ca56542f15943eb88e6ce2999f8c33f14f063f4676d6`다. critique ignore.md는 검색 범위에 없었다.

## 브라우저 증거

새 독립 탭에서 Chromium **156.0.8078.4**, headless, isolated context로 수행했다. 기본 MCP의 Chrome 실행 경로가 없어 부모가 마련한 동일 `@playwright/mcp@0.0.85` stdio helper와 캐시 Chromium 실행 파일을 사용했다. 사용자에게 보이는 Human 탭이나 화면을 제공했다고 주장하지 않는다.

기본 순회는 여섯 URL × (1440×1000 primary, 390×844 dark), 총 12조건이다. HTTP 200, JS pageerror 0, 문서 가로 넘침 0, alt 누락 0, inert 밖 aria-hidden 초점 신호 0을 확인했다. 루트의 20URL×양폭×양테마 80조건 결과는 별도 외부 증거이며 B가 재실행한 것으로 기록하지 않는다.

선정한 372개 계산 대비 표본은 최소 **5.19:1**, 해당 표본의 기준 미달 0이었다. 각 문단·제목·목차·표 정렬·차트 축의 실제 computed color와 조상 바탕을 합성했다. opacity 조상·배경 이미지·blend가 있는 경우를 제외했으며 모든 텍스트·수치·입력·상태를 전수 보증하는 값이 아니다.

### 조작·의미

- 모바일 메뉴: 이름 있는 modal dialog, 내부 초기 포커스, main inert, 2px 포커스, Escape 트리거 복귀를 확인했다. 테마 Switch는 실제 label로 “다크 모드, 꺼짐/켜짐” 이름을 가지며 Space로 모드를 바꾸고 내부 포커스를 유지했다.
- 참가자 관리: 390px에서 11개 행 하나씩 aria-pressed, 11개 중복 체크 마커 inert·aria-hidden·tabindex=-1을 확인했다. 제외 확인을 열고 Escape로 취소했을 때 선택과 초점이 보존됐다. 일괄 작업은 44px 이상이다. 최종 320px 양테마에서는 96px 행·198px 이름 영역·grid 배치와 overflow 0을 재확인했다.
- 수동 편성: 선택 시 자리 버튼 9개가 실제 배치 대상 이름을 제공하고 252×62px 대표 조작 영역을 보였다. 선택 안내가 헤더 아래에 유지되고 Escape로 배치 선택이 해제됐다. 이 경로에서는 실제 배치를 제출하지 않았다.
- 차트: role=img 이름과 여섯 축의 상세 수치가 있고, SVG 바깥 figcaption의 sr-only 목록에도 모든 수치가 있다. SVG 색·축 글자가 두 테마에서 읽히는 실제 이미지를 확인했다.
- 리더보드: 네이티브 caption·행/열 머리·정렬 버튼을 유지한다. 정렬 후 현재 머리 하나만 aria-sort를 가지며 기존 status 한 곳에서 변경을 알리고 머리에 초점이 남는다. 모든 지표를 가로로 확인하고 이름 열과 프로필 링크를 유지한다.

기존 “최근 10게임만” Switch는 containing HTML label 덕분에 브라우저 이름이 확인된다. label은 **139.875×24px**로 측정돼 AA의 24px 최소 크기를 충족하지만, 모든 컨트롤이 권장 44px라는 포괄적 결론은 낼 수 없다. 이번 변경에서 도입한 회귀로 세지 않았다.

### 확인한 P2와 최종 재검증

수정 전 390px에서 region 진입 후 실제 Tab을 이동하면 게임 버튼 x351.7..411.5가 region x25..365에 잘렸고 피해/분도 부분 가림을 보였다. 다른 경로에서는 고정 이름 열이 킬 관여 머리 일부를 덮었다. 조작은 가능하고 가로 스크롤 우회가 있었지만 현재 과업의 이름과 초점을 충분히 볼 수 없었다.

독립 브라우저 DOM에서만 다섯 대안을 비교했다. CSS scroll-padding, button scroll-margin, 둘의 결합은 native Tab 가림을 모두 해결하지 못했다. thead focusin에서 nearest scrollIntoView를 실행하고 region의 고정 이름 열 크기를 반영한 scroll-padding을 함께 쓰면 390px의 일곱 머리가 모두 보였다. 소스 변경은 부모가 수행했다.

최종 실제 소스는 `scroll-ps-[9.5rem] sm:scroll-ps-[14.5rem] scroll-pe-2`와 thead focusin의 `scrollIntoView({block:'nearest', inline:'nearest', behavior:'instant'})`를 사용한다. **320/390/640px × primary/dark**에서 정방향 7개·역방향 6개씩 **78포커스 표본 전부**가 고정 열과 오른쪽 clip·상단 헤더를 피해 보였고 2px outline을 유지했다. 여섯 조건 모두 정렬·초점·단일 aria-sort/status, ArrowRight와 실제 가로 휠 이동, 프로필 링크, 문서 overflow 0을 확인했다. viewport emulation과 브라우저 키보드/휠 입력이며 실제 터치 기기 검증을 대신하지 않는다.

수정 전/후 trace·임시 스타일 비교·최종 결과를 모두 browser-b.json에 보존했다. 수정 전 재현 이미지는 `b-stats-natural-2-390.png`, `b-stats-natural-5-390.png`, 수정 후는 `b-final-stats-*.png`다.

### Overlay와 standing 대비 신호

먼저 document.title 변경과 실제 script append/실행을 확인한 뒤 원래 제목과 DOM을 복원했다. mutable preflight가 성공했으므로 `impeccable live-server --background`를 실행해 포트 8400에서 detect.js를 문서·수동 편성·통계에 주입하고 2.6초 이상 기다렸다. 세 페이지 모두 script 로드가 성공했고 manual에는 실제 overlay marker 두 개가 생겼다. 런타임 console과 구조화된 findings를 별도로 저장했다.

manual의 미래 단계 번호와 라벨에서 **2.1:1 / 1.9:1** low-contrast 2그룹이 보고됐다. 상세의 “and 2 more” 집계 문구를 그대로 보존했다. ScrimSummary.svelte:117은 보조기기용 순서 목록과 aria-current=step을 제공하며 :124의 시각 Steps는 aria-hidden=true다. 이 구조는 중복 발화를 피하지만 눈으로 보는 미래 단계의 낮은 대비를 해결하지는 않는다. 이 공유 컴포넌트는 이번 후속에서 수정하지 않았고 도입 시점은 미확인이다. 부모에게 보고했으며 **standing advisory로 유지**, 새 회귀로 집계하거나 ignore를 추가하지 않았다. 정상/현재 단계·숨긴 대안의 존재와 시각 대비 문제를 혼동하지 않는다.

## 정리·제한

생성한 17장의 스크린샷을 모두 직접 열어 확인했고 각 SHA-256은 browser-b.json.screenshots에 저장했다. 최종 변경 소스와 config의 해시도 같은 JSON에 있다. CLI 결과와 runtime findings는 서로 다른 검사이며 건수를 합산하지 않는다.

주입 전용 서버는 `.agents/skills/impeccable/scripts/impeccable live-server stop --keep-inject`로 정리했고 “Stopped live server on port 8400” 응답을 확인했다. 프로젝트 HTML을 수정하지 않았으며 만든 탭은 닫았다. `/tmp/msm2-b-*`와 이번 조회 가이드 임시 파일은 보관 증거를 합친 뒤 삭제하고 공유 helper는 보존했다. 쿠키·환경변수·자격증명·요청 본문을 수집하지 않았고 overlay의 임시 토큰도 보관 자료에 넣지 않았다. 네트워크 쓰기 guard 아래 실제 또는 목 쓰기는 0이었다.

공식 Svelte MCP가 없어 부모의 설치 compiler/check 결과를 보조 근거로만 받았다. B는 부모가 완료한 check/build/web/bot/browser 테스트를 다시 실행하지 않았다. 현대 웹 가이드는 responsive-table·sortable-table·accessibility를 확인했으며 이 검토자는 소스를 수정하지 않았다. 물리 기기, 스크린리더 발화, 전체 STDF motion, 실제 로딩 성능은 이번 B의 완료 주장에 포함하지 않는다.

Questions skipped: 사용자가 승인한 후속 수정·재검증의 독립 B 결과이며 제품 범위·업무 규칙 변경 질문이 필요한 상태는 없다.
