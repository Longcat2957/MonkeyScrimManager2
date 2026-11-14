# Final Assessment B — technical audit and detector evidence

검토자: `/root/technical_review`. 대상 slug: `apps-web-src`. 판정은 직접 관찰·합성 색상 측정·원래 제품 의미에 근거한다. A 완료 전에는 detector 결과를 부모에게 공개하지 않았다. B 증거 수집과 마지막 UI21 재측정을 마친 뒤에만 A 최종 문서를 합성 참고용으로 열었다.

## Implementation integrity verdict

**Pass.** Slate/STDF·실제 진영/포지션/팀/ROFL/경매 상태가 제품 고유의 화면과 상호작용을 결정한다. detector의 28개 원시 신호를 28개 결함으로 계산하지 않았다. 실제 결함으로 확인한 마지막 신호는 수동 편성의 후보 MMR·빈 자리 및 선택/hover MMR 대비였으며 UI21로 수정·재검증했다.

## Audit health

점수는 확인한 구현 조건의 기술 감사이며 WCAG 인증이나 프로덕션 성능 보증이 아니다.

| 항목 | 점수 / 4 | 근거와 한계 |
| --- | --- | --- |
| 접근성 | 3 | 실제 입력 이름·오류 연결·오류 포커스·대화상자 순환/복귀·비활성 잠금·버튼 영역과 평면/이미지 배지 대비를 확인했다. 실제 스크린 리더 조합 전수 검증은 하지 않았다. |
| 성능 | 3 | 기존 이미지 lazy loading·빌드와 로컬 단회 성능 관찰을 유지한다. 프로덕션·실기기 CWV와 전후 최적화율은 측정하지 않았고 주장하지 않는다. |
| 테마 | 4 | 기본/다크와 고정 어두운 표면의 의미색·placeholder·본문 보조색·추가 상태 대비를 실제 합성으로 확인했다. |
| 반응형 | 4 | 전체 기본 화면의 두 폭 검증과 핵심 작업의 중간 폭·축소 높이·확대·키보드·합성 터치 증거를 종합했다. 물리 기기와 다른 브라우저 엔진은 범위 밖이다. |
| 구현 일관성 | 4 | STDF 네이티브 조작·공통 상태/오류/overlay 보완을 재사용하며 API·권한·0P/예산 등 업무 규칙을 바꾸지 않았다. 의도된 detector 신호를 삭제하지 않았다. |
| **합계** | **18 / 20 — Excellent** | 확인된 수정 가능한 UI21 결함은 재검증 완료. 외부 서비스·실기기 한계를 남긴 제한된 감사 점수다. |

## Source detector

최종 실행: `impeccable detect --json apps/web/src`. 종료 코드2는 정상적인 findings 반환이다. 원문은 `final-detector.json`에 있으며 경로·줄·snippet이 모두 보존돼 있다. **28건: warning1, advisory27.**

| 규칙 | 수 | 판단 |
| --- | --- | --- |
| side-tab | 1 | `matches/GameHero.svelte:34`. 기존 승리 진영의 파랑/빨강 의미 표시다. 승리 문구와 함께 쓰며 장식용 임의 강조가 아니다. 유지한다. |
| bounce-easing | 2 | `teams/AuctionTeamCard.svelte:237,243`. 기존 낙찰·배치 완료의 짧은 stamp/member 효과다. 빠른 다음 후보에서 정리되고 reduced-motion 정적 피드백이 있어 유지한다. |
| design-system-font-size | 24 | 새 DESIGN frontmatter의 기본 글자 램프와 기존 8/10/11/13px 조밀한 보조 표시의 차이다. 본문/핵심 조작 글자를 이 크기로 압축한 신규 결함이 아니다. 실제 읽기·확대 확인과 아래 사용처에 근거해 기록하며, 문서의 보조 크기 예외를 함께 읽어야 한다. |
| design-system-color | 1 | `app.html:0`, SvelteKit 치환 전 body의 기본 black을 읽는 정적 신호다. 실제 앱은 layout의 테마 텍스트 토큰을 사용한다. 새 literal UI 색상 결함으로 취급하지 않는다. |

초기 detector3건에서24개 font·1개 color advisory가 추가된 것은 새 DESIGN frontmatter로 규칙이 활성화된 결과다. 동일 기준의 결함 증가율로 해석할 수 없다.

보조 글자 신호의 정확한 사용처(기존 크기 예외는 최종 DESIGN/design-system에 기록됨):

| apps/web/src 상대 파일 | 줄 |
| --- | --- |
| `lib/components/common/AvatarStack.svelte` | 82 |
| `lib/components/common/DateBadge.svelte` | 14, 21 |
| `lib/components/guild/NextScrimHero.svelte` | 108 |
| `lib/components/guild/RankingBoard.svelte` | 146 |
| `lib/components/matches/GameTeamTable.svelte` | 93, 121 |
| `lib/components/matches/LoadoutIcon.svelte` | 30 |
| `lib/components/players/RadarChart.svelte` | 66 |
| `lib/components/stats/LeaderboardTable.svelte` | 109 |
| `lib/components/teams/AuctionDraftBoard.svelte` | 372, 457 |
| `lib/components/teams/AuctionTargetProfile.svelte` | 54, 72, 89, 127, 146 |
| `lib/components/teams/FormationHeadToHead.svelte` | 35, 65 |
| `lib/components/teams/FormationSynergyRail.svelte` | 59, 69 |
| `lib/components/teams/FormationTeamCard.svelte` | 62, 101 |
| `routes/g/[guildId]/players/[userId]/+page.svelte` | 251 |

## Browser overlay

Playwright MCP의 새 격리 탭에서 title 변경과 script 태그 추가를 실제 실행했다. manual/stats/match 각390×844에서 `detect.js` 주입과 console 결과가3/3 확인됐다. headless Chromium 대체 MCP였으므로 사용자 화면에 보이는 `[Human]` 브라우저 창이라고 주장하지 않는다.

| URL | HTTP | mutation / injection | 원시 console 신호 |
| --- | --- | --- | --- |
| `/g/devGuild001/scrims/devScrim007/manual` | 200 | true / true | 4 |
| `/g/devGuild001/stats` | 200 | true / true | 0 |
| `/g/devGuild001/matches/devMatch001` | 200 | true / true | 15 |

원시 overlay 수는 CLI 수나 확정 결함 수와 합산하지 않는다. 추가 수집한 console 전체 인자로 경기15개를 정확히 분류하고, 전체 PNG를 실제 읽었다. 상세 원문은 `final-match-signals.json`에 보존했다.

| 경기 overlay 규칙 | 수 | 실제 대상과 판정 근거 |
| --- | --- | --- |
| side-tab | 1 | GameHero의 승리 진영 경계다. 파랑/빨강이 실제 승리 팀 문구를 보조하며 사용자가 선택 세트의 승패를 즉시 구분하는 기능이다. 임의 장식으로 보지 않아 보존했다. |
| undersized-ui-text | 12 | 10명의 챔피언 레벨 숫자와 ACE/MVP 두 짧은 표시, 모두10px다. 실제 버튼·입력·본문 이름이 아니라 초상/선수명 옆의 작은 부가 정보다. 레벨은 선수 상세의 보통 크기 문구에서도 읽을 수 있고, 상세 버튼 영역은44px다. 전체 테이블 이미지에서 각 숫자/표시의 범위와 본문 위계를 직접 확인했으며,11px라는 detector 고유 floor 미달만으로 추가 확정 결함으로 계산하지 않았다. 기존 조밀한 글자 예외는 DESIGN/design-system에 기록했다. |
| flat-type-hierarchy | 1 | detector는 body14px/h116px/h2·h318px의 tag별 크기만 비교했다. 실제 경기 헤더·히어로는 하위 span의 큰 시리즈/킬 점수와 팀 이름·상태·메타로 읽기 위계를 만든다. 실제 이미지의 목적·핵심 수치·다음 행동이 분명하므로 tag 크기 비율만 맞추는 수정은 하지 않았다. |
| nested-cards | 1 | 승리 결과 히어로 안의 MVP 정보 그룹이다. 바깥은 해당 세트 결과, 안쪽은 수상 선수·챔피언·KDA이며 목적이 구분된다. 여러 동등한 장식 카드를 중첩한 구조가 아니고 기존 게임 결과의 의미 있는 구획이므로 보존했다. |

경기의 실제 flat-surface 대비 재측정은 양 테마 모두4.5 미만0개였다. 이미지 배지의 별도 픽셀 증거는 기존 inverse-validation을 따른다. 위 판정은 개별 대상·실제 크기·역할·복구 경로·실제 이미지에 근거하며, advisory라는 등급만으로 제외하지 않았다.

manual overlay의 낮은 MMR 대비는 **UI21**로 채택했다. inactive 미래 단계는 조작 불가한 STDF 상태 표시이며 같은 진행 상태를 제공하는 별도 보조기기 목록이 있다. 이 의도된 비활성 표현을 본문 대비 결함과 구분해 유지했다. Overlay PNG3장은 실제 이미지를 읽었다. manual 원시 overlay는 UI21 수정 전 증거이며 수정 후의 검증은 아래 실제 소스 합성 측정과 기본 화면4장으로 대체했다.

## UI21 correction and revalidation

변경 파일: `teams/FormationPool.svelte`, `teams/FormationTeamCard.svelte`. 후보 MMR·팀 평균·배정 선수 MMR·실제 빈 자리 문구를 기존 `text-text-muted`로 통일했다. 어두운 강조 hover 위 배정 선수 MMR 한 곳은 기존 `dark:text-dark`를 사용한다. 업무 데이터·선택·배치 로직은 바꾸지 않았다.

- 수정 전: 후보 MMR light4.47:1; 실제 빈 자리 light2.60:1. 배정 선수 MMR 선택 light4.45:1, hover light3.92/dark3.98:1. dark 보조 토큰만 적용한 중간 hover4.09:1도 실제 재현해 후속 수정했다.
- 최종: primary rest/hover/선택/배정 선수 hover 최소7.01/6.45/6.52/6.15:1. dark 최소6.55/6.05/4.95/6.55:1. 두 폭에서16조건 모두4.5 이상, pageerror0.
- canonical manual4장은 새 페이지에서 scrollY0·focusBODY·원본6/10/미배정4명으로 재촬영하고 실제 읽었다. 상호작용 후 스크롤이 복원돼 sticky header가 중간에 찍힌 이전 캡처는 대체했다. 원본 배정은 바꾸지 않았다.
- SHA-256과 실제 읽기 기록은 `final-data-workflow-visual-read.json`의 manual4개 항목 및 `manual-contrast-validation.json`에 갱신했다.

## Admin gate

`admin-validation.json`에 기본/Discord/계정 시트12개 화면 조건과 동작 증거를 보존했다.1440×1000·390×844, primary/dark에서 overflow0·pageerror0, 계정/설정/시트 조작44px 이상, popup/입력 트리1개다.390×500에서도 시트 높이를 제한했다.

조회 invalid는0POST·aria-invalid/설명 연결·입력 포커스,404/503과 네트워크 중단은 입력 보존, 지연 조회·연결은1POST/활성 조작0개, link409는 결과 보존→실제 재시도→연결 해제 복구, 대표 변경→복구,403거부, Escape·Tab순환·호출 버튼 포커스 복귀가 통과했다. Discord는1POST 중4개 설정 모두 잠금,503 후 기존 값 보존·재시도·결과 채널null 원상복구 및 기존 역할 제한을 확인했다. 추가 계정은 제거하고 기존 대표·연결과 Discord 값을 복구했다.

## Remaining scope

이 B 검증에서 미해결 P0/P1 UI 구현 결함은 확인하지 않았다. 보조 타입 크기는 의도된 사용처와 문서 예외로 관리한다. 실서비스 Discord/Riot/ROFL·실제 사용자 데이터·물리 기기·다른 엔진·실제 스크린 리더·프로덕션 성능은 이 로컬 감사의 인증 범위가 아니다. 검증하지 않은 성능 개선율을 보고하지 않는다.

## Run notes

- target slug: `apps-web-src`; 별도 ignore flag·규칙·파일 예외를 새로 추가하지 않았다. 기존 설정은 유지했다.
- assessment independence: A 완료 전 결과 비공개; B 자료를 확정한 뒤 A 문서를 합성 참고로 읽었다.
- CLI: 마지막 source 기준28개 원시 신호, 정상 종료2; 원문 보존.
- browser: fresh isolated tab / mutable injection3/3 / headless MCP fallback. 사용자에게 보이는 창은 없다.
- live server: port8400을 `stop --keep-inject`로 종료했다. 앱 HTML은 수정하지 않았고 server.json은 제거됐다.
- screenshot cleanup: 상호작용 상태 캡처를 canonical 기본 상태4장으로 대체하고 실제 이미지·hash를 재검증했다.
- temporary diagnostics: 검토와 재현용 `/tmp/msm2-*` 입력/출력은 세션 인계용으로 보존했다. 결과 원문과 요약은 artifacts에 복사했다. 앱 주입·live 실행 메타는 남기지 않았다.
- code gate: 최종 수동 색상 수정 후 child svelte-check0 errors/0 warnings. parent가 마지막 소스로 build와 전체 체크/기존 테스트를 별도 완료한다.

### Modern Web Guidance

- **accessibility**: 실제 입력 오류를 하나의 설명과 연결하고 잘못된 입력에 포커스를 돌렸다(“Link hints to inputs via aria-describedby”). 이름이 같은 계정 조작은 대상 계정으로 구분했다.
- **dialog**: 기존 STDF/overlay 구성을 유지하면서 두 조회 단계에 공통으로 접근 가능한 네이티브 닫기 버튼을 제공했다(“use a native `<button>` with an accessible name for close controls”).
