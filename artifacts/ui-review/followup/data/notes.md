# DQ02 통계 표 이름 식별성 보완

2026-11-14, `/g/devGuild001/stats`. 판정: **충분**. `typeset`·`adapt`·`polish`와 craft-floor 절차를 적용했다. 데이터, 7개 지표, 정렬, 고정 이름 열, 단일 프로필 링크와 기존 테마를 유지했다.

## 실제 변경과 전후 근거

- `LeaderboardTable.svelte`: 기존 `PlayerFace`의 `sm`(28px) 옵션과 8px 간격으로 이름 공간을 확보하고, 이름의 말줄임을 자연 줄바꿈으로 바꿨다. Noto Sans KR 14px/20px·600은 유지했다. 링크는 하나이며 최소 높이는 44px이다.
- 모바일 기본 이름 `원딜은억울해`, `와드박는기계`, `서폿장인 몽키`는 수정 전 각각 `clientWidth/scrollWidth`가 72/77, 72/77, 72/81px로 잘렸다. 수정 후 각각 77/77, 77/77, 81/81px로 모두 한 줄에 보인다. 별도 페이지 이동이나 hover 없이 표 안에서 이름을 구별할 수 있다.
- 한·영 동일 접두어 이름 4개를 격리된 탭의 렌더링 텍스트에만 주입했다. 모바일 3줄, 넓은 화면 2줄로 끝의 `정글`·`서포터`·`Alpha`·`Beta`까지 보였다. 원본 데이터와 CSS는 이 검사에서 변경하지 않았다. 이름이 길 때 행 높이가 자연스럽게 늘어나는 선택이며 지표를 숨기거나 글자를 줄이지 않았다.
- `stats/+page.svelte`: 320px 실제 화면에서 `111`이 `11`/`1`, `2.19`가 `2.1`/`9`로 분리되던 추가 결함을 고쳤다. 챔피언 표의 셀은 줄바꿈하지 않고 최소 320px 표를 내부 스크롤한다. 기존 caption을 참조하는 이름 있는 region과 키보드 진입점을 제공했다. 390px 이상에서는 네 열이 모두 들어간다. 320px에서도 숫자를 온전히 읽으며 KDA로 가로 이동할 수 있다.

## 검증

| 조건 | 결과 |
| --- | --- |
| 320×844, 390×844, 768×1000, 1440×1000 × primary/dark | 8/8 통과 |
| 기본 이름 20개 × 8조건 | 잘림 0, 링크 높이 44px 이상 |
| 동일 접두어 긴 이름 4개 × 8조건 | 32/32 끝부분 표시, 셀 밖 넘침 0 |
| 7개 지표 × 양방향 × 8조건 | 112/112 숫자 순서와 단일 `aria-sort` 통과 |
| 고정 이름 열·키보드 가로 스크롤 | 필요한 폭에서 동작, 이름 열 `sticky` 유지 |
| 챔피언 15행의 수치 45개 × 8조건 | 전부 한 줄, 4열 보존, 페이지 가로 넘침 0 |
| 키보드 Enter / 터치 프로필 이동 | 각 3/3 올바른 프로필, 대상별 링크 1개 |
| 터치 가로 / 세로 제스처 | 표 가로 219px 이동 중 페이지 유지, 세로는 페이지 713→865px 이동 |
| 콘솔 pageerror / 쓰기 요청 / 중복 ID | 0 / 0 / 0 |
| `pnpm --filter @msm2/web check` | 오류 0, 경고 0 |

키보드 포커스의 실제 2px outline도 확인했다. 입력 검증은 headless Chromium의 native keyboard·touchscreen tap·CDP touchStart/move/end를 사용했다. 물리 기기나 Safari 검증을 뜻하지 않는다. 중앙 check/build/test는 root가 최종 소스에 실행한다.

`before/` 8장, `after/` 기본 8장과 긴 이름 8장, 총 24장을 실제 이미지로 읽고 비교했다. 이미지 크기·SHA-256·소스 해시는 `proofs.json`, 조건별 측정값과 정렬·조작 결과는 `validation.json`에 저장했다.

## Modern Web Guidance

- `responsive-table`: “Give the wrapper a `role="region"` attribute” — 기존 caption을 이름으로 사용한 키보드 스크롤 region을 적용했다. 비교 목적의 native table과 모든 지표를 유지했다.
- `css-layout`: “Set `min-inline-size: 0` (or `min-width: 0`) on flex items” — 이름 flex 항목의 최소 크기를 제한하고 글자의 자연 줄바꿈을 허용했다.

가이드는 `pnpx modern-web-guidance@latest`로 검색·조회했으며, 통계 표에는 카드 전환이나 열 숨김을 적용하지 않았다. 사용자 이름을 표 안에서 식별해야 한다는 이번 요구에 맞춰 이름만 줄바꿈하고 수치는 한 줄로 유지했다.

## 유지한 범위

서버 업적 순위 `RankingBoard`의 기존 bounded InfiniteScroll과 하단 부분 행은 바꾸지 않았다. 변동하는 행 높이를 강제로 맞추거나 추가 스크롤 제어를 넣을 근거가 부족하며, 이번 식별성 수정과 분리되는 P3 사항이다. 추가 API·공통 PlayerName 옵션·중복 조작·설명은 만들지 않았다.
