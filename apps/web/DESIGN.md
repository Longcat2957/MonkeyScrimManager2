---
name: Monkeybot
description: 내전 운영의 다음 행동과 경기 기록을 명확히 보여 주는 Slate 기반 UI
colors:
  primary: "oklch(0.446 0.043 257.281)"
  dark: "oklch(0.869 0.022 252.894)"
  bg-base: "oklch(0.984 0.003 247.858)"
  bg-surface: "oklch(1 0 0)"
  bg-overlay: "oklch(0.968 0.007 247.896)"
  bg-highlight: "oklch(0.929 0.013 255.508)"
  bg-base-dark: "oklch(0.129 0.042 264.695)"
  bg-surface-dark: "oklch(0.208 0.042 265.755)"
  bg-overlay-dark: "oklch(0.279 0.041 260.031)"
  bg-highlight-dark: "oklch(0.372 0.044 257.287)"
  text-primary: "oklch(0.208 0.042 265.755)"
  text-dark: "oklch(0.968 0.007 247.896)"
  text-on-primary: "oklch(0.984 0.003 247.858)"
  text-on-dark: "oklch(0.129 0.042 264.695)"
  success: "oklch(0.432 0.095 166.913)"
  warning: "oklch(0.473 0.137 46.201)"
  error: "oklch(0.514 0.222 16.935)"
  info: "oklch(0.5 0.134 242.749)"
  medal-gold: "oklch(0.84 0.15 85)"
  medal-silver: "oklch(0.83 0.02 255)"
  medal-bronze: "oklch(0.72 0.1 55)"
  success-inverse: "oklch(0.765 0.153 163.2)"
  warning-inverse: "oklch(0.769 0.165 61.3)"
  error-inverse: "oklch(0.71 0.166 15.3)"
  info-inverse: "oklch(0.746 0.13 237.3)"
typography:
  wordmark:
    fontFamily: "Jersey 10, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: "1"
  headline:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  title:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  metadata:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  box: "0.75rem"
  form: "0.5rem"
  small: "0.25rem"
spacing:
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  6: "1.5rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
    rounded: "{rounded.form}"
    padding: "0.75rem 1rem"
  button-secondary:
    textColor: "{colors.text-primary}"
    rounded: "{rounded.form}"
    padding: "0.75rem 1rem"
  status-tag:
    typography: "{typography.metadata}"
    rounded: "{rounded.small}"
    padding: "0.125rem 0.375rem"
  list-row:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    padding: "1rem 0.75rem"
---

# Design System: Monkeybot

## Overview

**Creative North Star: "내전 운영 작업판"**

이 문서는 구현과 브라우저 검증으로 확인한 현재 시각 체계를 기록한다. 기존 Slate/STDF의 차분한 표면에 실제 챔피언·포지션 이미지를 결합하고, 경기와 운영 작업의 숫자·다음 행동을 먼저 읽게 한다. 소개와 문서는 읽기에, 운영 화면은 과업 완료에 맞춘다.

표면과 경계는 정보를 묶고 색은 상태와 진영을 구분한다. 워드마크만 Jersey 10을 쓰며 본문과 조작은 Noto Sans KR을 유지한다. 브랜드·권한·데이터 의미는 [PRODUCT.md](PRODUCT.md)와 [제품 목적](../../docs/purpose.md)이 정한다. 구현 선택과 상태 처리의 세부 기준은 [디자인 시스템](../../docs/web/design-system.md)·[UI 패턴](../../docs/web/patterns.md)을 따른다.

**Key Characteristics:**

- Slate 표면과 STDF 네이티브 조작
- 경기·세트·진영을 구분하는 숫자와 문구
- 모바일·키보드에서도 같은 핵심 과업
- 한 동작과 한 설명을 필요한 한 곳에 배치

## Colors

Slate의 차분한 주조색과 밝기 단계로 기본 UI를 구성한다. 정확한 값은 frontmatter와 [layout.css](src/routes/layout.css)를 따른다. `*-inverse`는 다크 모드·고정 어두운 표면에서 같은 의미 토큰에 적용되는 값을 구분해 기록한 이름이며 별도 CSS 변수 이름은 아니다.

- **Primary / Dark:** 일반 조작과 선택 상태. 라이트·다크 모드의 STDF 테마색이다.
- **Neutral:** base는 페이지, surface는 목록·작업 영역, overlay는 메뉴, highlight는 선택·강조된 표면에 사용한다.
- **상태:** success·warning·error·info는 문구와 함께 쓴다. 라이트의 success·warning은 작은 글자의 합성 대비를 위해 더 짙은 기존 팔레트 단계를 사용한다.
- **보조 글자:** `text-text-muted`는 라이트 primary·다크 dark-700을 사용한다. 의미색이 있는 조상에 무차별 opacity를 적용하지 않는다.
- **고정 어두운 표면:** `.inverse-surface`는 페이지 테마와 관계없이 밝은 의미색을 사용한다. 챔피언 아트 위의 작은 상태 배지는 독립된 어두운 바탕으로 대비를 확보한다.
- **순위:** gold·silver·bronze는 1~3위 숫자와 함께 쓴다. 업적의 금색 강조와 챔피언 아트는 기존 시각 언어다.

## Typography

워드마크는 Jersey 10 regular 400이며 합성 굵기를 쓰지 않는다. 본문·메뉴·STDF 조작은 Noto Sans KR이다.

- 페이지 제목은 일반적으로 headline, 영역 제목은 title을 사용한다. 내전·경기 히어로는 실제 데이터의 우선순위에 따라 더 크게 표시한다.
- 본문은 body, 버튼·입력 이름은 label, 날짜·보조 수치는 metadata 역할이다. 모든 텍스트를 작은 보조 크기로 압축하지 않는다.
- 기존 조밀한 보조 표시의 10/11/13px는 날짜 월·겹친 얼굴 수·MMR·차트/표/시너지 수치에 한정한다. LoadoutIcon의 8px는 이미지가 없을 때 두 글자 대체 표시이며 전체 이름은 title로 보존한다. 이 크기를 본문·핵심 조작의 기본값으로 확대 적용하지 않는다. 200%에 해당하는 유효 폭·장문·키보드 검증과 실제 크기의 전수 가독성/보조기기 검증은 구분한다.
- 점수·MMR·통계·시간에는 tabular numerals를 사용한다. 미확인 값은 기존 기능의 `-` 또는 `—` 규칙을 따른다.
- 한국어는 어절로 줄을 바꾸고, 띄어쓰기 없는 긴 이름은 영역을 넘칠 때 끊는다. 상세의 주요 이름과 통계 비교의 고정 이름 열은 줄바꿈해 식별할 수 있게 한다. 숫자는 한 줄에 유지하며 보조 목록에는 필요할 때 말줄임을 사용한다.

## Layout

- 공유 헤더는 (4rem) 높이이며 최대 (96rem), 본문 틀은 최대 (84rem)이다. `.app-frame`은 768px 이상에서 화면보다 (3rem), 미만에서 (0.5rem) 좁다.
- 간격은 Tailwind 기본 스케일을 사용한다. 연관 정보는 (0.5~1rem), 독립 영역은 (1.5~2rem) 간격으로 구분한다. 문서는 최대 (48rem) 폭과 (1.75) 행간이다.
- 헤더의 모바일·데스크톱 구조는 1024px에서 교체한다. 두 버전이 동시에 조작 가능하지 않게 한다. 콘텐츠 배치는 640·768·1024·1280px의 실제 역할에 따라 전환한다.
- 작업판은 미배정 → 배치 대상 순서로 읽으며 좁은 화면에서는 세로로 쌓는다. 데이터 표는 모든 핵심 열을 보존하고 이름 있는 키보드 가로 스크롤과 고정 이름 열을 필요에 따라 쓴다.
- 수동 편성의 기존 선택 안내는 선택 중 공유 헤더 아래에 고정한다. 작업판은 `overflow-clip`으로 불필요한 스크롤 컨테이너를 만들지 않고 안내 높이를 키보드 스크롤 여백에 반영한다.
- 모집 요약에서 운영자는 단계 조작·참가자를 먼저, 참가자는 내 신청을 먼저 읽는다. 같은 참가자 패널을 역할 분기에서 한 번만 렌더링하며 DOM 순서로 배치한다.
- 사용자에게 필요한 지표를 먼저 표시하고 추가 지표는 접근 가능한 펼침 영역으로 제공한다. 중요한 데이터와 기능을 삭제해 밀도를 줄이지 않는다.
- 선수 전적은 핵심 지표 → 포지션별 MMR → 챔피언·기록 → 성향·듀오 순서다. 데스크톱에서 지표와 MMR은 같은 첫 행에 두고 모바일에서도 MMR을 기록보다 먼저 읽는다.
- 홈은 실제 로그인·서버 상태의 시작 안내와 운영 흐름을 구분한다. 이용 문서는 참가·기록과 운영 과업을 단일 목차·본문에서 함께 묶고 기존 앵커를 유지한다.

## Elevation & Depth

기본 목록·작업판은 평평한 표면과 얇은 경계로 구분한다. 떠 있는 메뉴·팝업의 깊이는 STDF 기본 표현에 맡기며, 서비스 전체에 별도의 그림자 스케일을 추가하지 않는다. 챔피언 히어로의 어두운 오버레이는 배경 아트 위의 읽기를 위한 것이다.

## Shapes

내용 상자는 box, 입력·버튼은 form, 작은 상태·아이콘은 small 모서리를 사용한다. 사진·얼굴·작은 순위 표시는 필요에 따라 원형이다. 작업판의 연속 칸은 경계와 한 픽셀 간격으로 묶는다.

## Components

- **Buttons:** STDF Button의 base·lineLight·text·textState를 목적에 따라 사용한다. 주요 조작과 모바일 버튼은 최소 (44px) 영역을 확보한다. 네이티브 disabled와 로딩 표시를 사용하고 함수에서도 중복 실행을 막는다.
- **Inputs:** STDF Input의 보이는 title과 placeholder를 구분한다. inputLabel은 실제 입력·지우기 이름을, inputFeedback은 실제 오류 연결을 보완한다. 오류는 필드 근처 한 곳에 쓴다. 폼의 nonSubmitButtons는 선택 조작의 잘못된 제출과 조합 중 Enter를 방지한다.
- **Navigation:** 경로 이동은 링크이며 선택 상태는 aria-current로 표시한다. 헤더가 서버·내전·계정 이동을 맡고 푸터는 문서·약관·개인정보를 제공한다. 동일 목적지 조작을 본문에 중복하지 않는다. 비로그인 홈의 기존 로그인 링크만 테마색으로 강조하고 시작 안내는 그 조작을 참조한다.
- **ParticipantBoard:** 관리 모드에서도 사람마다 선택 상태를 가진 행 하나를 조작한다. STDF List의 체크 표시는 장식이며 일괄 작업은 44px 높이와 줄바꿈을 제공한다. 요청 중 fieldset·함수 가드로 중복 실행을 막고 실패 시 선택과 포커스를 유지한다.
- **FormationTeamCard / RadarChart:** 편성의 MMR·희망 외 표시는 작은 자리에서도 줄바꿈해 유지하고 선택 대상에는 빈 해제 열을 두지 않는다. 성향 그래프는 기존 축별 상위 %와 방향 설명을 화면에 제공해 hover 없이 해석할 수 있게 한다.
- **LeaderboardTable:** 키보드로 정렬 머리에 진입하면 고정 이름 열과 오른쪽 경계 안으로 즉시 이동한다. 고정 열 너비를 반영한 scroll-padding과 `scrollIntoView(nearest)`를 함께 사용하며 수동 가로 스크롤을 막지 않는다.
- **SelectionTabs / AccessibleAccordion:** 설치 STDF의 외형과 옵션을 유지하면서 native 버튼의 선택·펼침 상태와 실제 패널 연결을 공통 보완한다. 실제 행동과 다른 ARIA 역할을 만들지 않는다.
- **StatusTag:** 상태 표시는 동작이 없다. STDF Tag는 inert 장식으로 쓰고 상태 문구는 보조기기에도 제공한다.
- **LinkCell:** 이동하는 목록 행은 링크 의미를 유지한다. 같은 기록을 중복 표시할 때 정적 변형을 사용해 목적지 조작은 한 곳에 둔다.
- **Calendar:** STDF 인라인 달력과 공식 높이 단위를 유지한다. 요일과 날짜 열은 일치해야 하며, 빈 칸은 조작하지 않는다. 날짜 버튼에 연·월·일과 선택 상태를 제공하고 선택 뒤 시각 입력으로 이동한다.
- **Dialogs:** STDF Popup·Dialog에 overlay를 연결해 배경 inert, 포커스 순환·복귀와 Escape를 처리한다. 열린 입력창은 위치 전환을 고정해 입력 트리를 하나만 유지한다.
- **Feedback / Motion:** 저장·실패·재시도는 해당 작업 가까이 표시한다. 경매 완료의 기존 짧은 효과는 한 번의 의미 있는 순간으로 유지하며 새 후보에서 정리한다. reduced-motion에서는 이동·색종이를 줄이고 정적 완료 표시를 남긴다. Accordion도 불필요한 펼침 이동을 줄인다.

## Do's and Don'ts

### Do:

- Do STDF의 공식 API와 기존 서비스 컴포넌트를 먼저 사용한다.
- Do 상태에 문구를 함께 제공하고 두 테마에서 대비를 실제 표면과 측정한다.
- Do 좁은 화면에서 작업 순서와 DOM·키보드 순서를 맞춘다.
- Do 오류가 난 입력과 현재 작업을 보존하고 다음 행동을 같은 영역에 알린다.

### Don't:

- Don't 워드마크 외의 본문과 조작에 브랜드 글꼴을 사용한다.
- Don't 같은 행동·목적지·설명을 페이지의 여러 곳에 반복한다.
- Don't 누락된 경기 시각·수치·포지션을 다른 데이터로 추정해 채운다.
- Don't 의미 없는 강조색·배지·장식이나 동작하지 않는 조작을 추가한다.
