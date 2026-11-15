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
- **예정 단계:** 모집 요약의 단계 제목·번호·원 테두리는 `text-text-muted`를 사용하고 opacity를 낮추지 않는다. 현재의 채운 원, 완료 체크, 예정의 빈 원으로 상태를 함께 구분한다. 연결선은 장식으로 유지한다.
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
- **Switch:** STDF Switch의 기존 외형과 버튼을 유지하며 연결된 label 전체를 최소 (44px) 높이로 만든다. 실제 버튼에 switch 역할·aria-checked·type·native disabled를 연결하고 제목과 부제 설명을 분리한다. 키보드 Space와 label의 여백 클릭이 같은 동작을 수행한다.
- **Inputs:** STDF Input의 보이는 title과 placeholder를 구분한다. inputLabel은 실제 입력·지우기 이름을, inputFeedback은 실제 오류 연결을 보완한다. 오류는 필드 근처 한 곳에 쓴다. 폼의 nonSubmitButtons는 선택 조작의 잘못된 제출과 조합 중 Enter를 방지한다.
- **Navigation:** 경로 이동은 링크이며 선택 상태는 aria-current로 표시한다. 헤더가 서버·내전·계정 이동을 맡고 푸터는 문서·약관·개인정보와 단일 문의 mailto를 제공한다. 짧은 링크도 최소44×44px로 조작하고 좁으면 DOM 순서로 줄을 바꾼다. 동일 목적지 조작을 본문에 중복하지 않는다. 비로그인 홈의 기존 로그인 링크만 테마색으로 강조하고 시작 안내는 그 조작을 참조한다.
- **ParticipantBoard:** 관리 모드에서도 사람마다 선택 상태를 가진 행 하나를 조작한다. STDF List의 체크 표시는 장식이며 일괄 작업은 44px 높이와 줄바꿈을 제공한다. 요청 중 fieldset·함수 가드로 중복 실행을 막고 실패 시 선택과 포커스를 유지한다.
- **FormationTeamCard / RadarChart:** 편성의 MMR·희망 외 표시는 작은 자리에서도 줄바꿈해 유지하고 선택 대상에는 빈 해제 열을 두지 않는다. 성향 그래프는 기존 축별 상위 %와 방향 설명을 화면에 제공해 hover 없이 해석할 수 있게 한다.
- **편성 참고 전적 / 경매 후보:** 같은 서버·내전에 고정된 시즌의 실제 ROFL 기록을 표시한다. 시너지는 같은 팀, 라인 상대 전적은 실제 같은 포지션끼리만 비교한다. 희망 포지션과 전적의 주력 포지션을 구분하고, 둘 다 없으면 미확인으로 남긴다. 기록이 없으면 안내를 한 곳에 표시하고 지원하지 않는 Riot 자료를 빈 카드로 만들지 않는다. 선호 챔피언은 공개인 활성 사용자의 저장 순서를 유지하며 첫 희망 포지션 또는 실제 주력을 기준으로 고르고 해당 포지션을 함께 표시한다. 절대 시각이 없는 기록은 최근 순서·연승으로 해석하지 않는다. 후보 MMR은 좁은 폭에서 줄을 바꾸고, 상세 스크롤 영역에는 이름과 키보드 진입점을 제공한다.
- **LeaderboardTable:** 키보드로 정렬 머리에 진입하면 고정 이름 열과 오른쪽 경계 안으로 즉시 이동한다. 고정 열 너비를 반영한 scroll-padding과 `scrollIntoView(nearest)`를 함께 사용하며 수동 가로 스크롤을 막지 않는다.
- **SelectionTabs / AccessibleAccordion:** 설치 STDF의 외형과 옵션을 유지하면서 native 버튼의 선택·펼침 상태와 실제 패널 연결을 공통 보완한다. 실제 행동과 다른 ARIA 역할을 만들지 않는다.
- **StatusTag:** 상태 표시는 동작이 없다. STDF Tag는 inert 장식으로 쓰고 상태 문구는 보조기기에도 제공한다.
- **LinkCell:** 이동하는 목록 행은 링크 의미를 유지한다. 같은 기록을 중복 표시할 때 정적 변형을 사용해 목적지 조작은 한 곳에 둔다.
- **Calendar:** STDF 인라인 달력과 공식 높이 단위를 유지한다. 요일과 날짜 열은 일치해야 하며, 빈 칸은 조작하지 않는다. 날짜 버튼에 연·월·일과 선택 상태를 제공하고 선택 뒤 시각 입력으로 이동한다.
- **Dialogs:** STDF Popup·Dialog에 overlay를 연결해 배경 inert, 포커스 순환·복귀와 Escape를 처리한다. 열린 입력창은 위치 전환을 고정해 입력 트리를 하나만 유지한다. 공통 확인창의 실제 패널은 최대 (36rem)·(85dvh)로 제한하고 긴 본문은 왼쪽 정렬·(1.75rem) 행간으로 읽는다. 설치 STDF에 최대 폭 옵션이 없어 이 호스트에만 CSS를 적용한다.
- **Feedback / Motion:** 저장·실패·재시도는 해당 작업 가까이 표시한다. 경매 완료의 기존 짧은 효과는 한 번의 의미 있는 순간으로 유지하며 새 후보에서 정리한다. reduced-motion에서는 이동·색종이를 줄이고 정적 완료 표시를 남긴다. Accordion도 불필요한 펼침 이동을 줄인다.
- **조회 자동 갱신:** 읽기 전용 경매의 지속 갱신과 일회 새로고침은 다른 조작으로 제공한다. 일시정지·숨긴 탭·offline에서는 반복 조회를 멈추고, 실패에는 마지막 확인값과 한 곳의 복구 안내를 유지한다. 조용한 반복 조회마다 로딩을 발화하거나 사용자의 초점을 옮기지 않는다. 데이터 준비는 페이지가, 버튼과 판의 표현은 기존 컴포넌트와 snippet이 담당한다.
- **운영 복구:** 취소 복구와 원래 단계 재개는 운영 메뉴 한 곳에서 제공한다. 시작 전 취소는 이전 단계로 정확 복구한다. 진행 중 전체 취소는 세트 수·결과/MMR 역분개·이력 보존을 확인창 한 곳에서 설명하며 복구는 편성 준비 복귀이고 결과 재개가 아님을 구분한다. 복원 근거가 없는 경우는 이유를 표시해 비활성으로 둔다. 중도 종료 결과는 현재 점수 우세·동점과 이미 종료된 상태를 함께 읽게 하며 새 편성을 시작하라는 빈 안내를 재사용하지 않는다.
- **SeasonSelector:** 전적·통계·순위에서 같은 시즌 선택 조작을 재사용한다. 빈 기록에서도 선택은 유지하고 시즌이 하나면 정적 이름으로 표시한다. 선택할 때 다른 조회 조건을 유지하고 쪽 위치만 초기화한다. 조작은 최소 (48px), 이름은 줄바꿈하며 실제 버튼의 펼침 상태를 알린다. 메뉴는 기존 ActionMenu를 쓰고 판단에 필요한 긴 이름·설명에만 wrapContent 변형을 적용한다. 순위의 추가 조회·선수 이동은 선택 시즌을 유지한다.
- **GuildAuditHistory:** 관리 변경은 최신순 목록으로 읽고 시각·대상·담당자와 필요한 변경 전후만 표시한다. 긴 이름은 줄바꿈하고 이력 자체를 조작 버튼으로 만들지 않는다. 이력 없음과 범위 밖 쪽을 구분하며 기존 PageNav로 복구한다. 관리 화면의 헤더 `관리`는 현재 위치를 정적으로 표시하고 멤버·Discord·시즌·변경 이력 전환은 본문 한 곳에서만 제공한다.
- **ServiceAdminManagement:** 서비스 운영자와 길드 관리자의 역할을 구분한다. 동명이인의 조작·확인·감사는 이름과 ID로 식별하고 긴 영문도 줄바꿈한다. 마지막 운영자의 회수는 이유와 함께 비활성으로 제공한다. 잘못된 입력은 제출 후 설명하고 보존하며, 확인·요청 중에는 중복을 막는다. 타인 회수 후 입력으로 포커스를 이동하고 자기 회수는 내 정보로 이동한다.
- **PrivacySettings:** 본인 설정은 독립된 두 선택과 한 저장 버튼으로 제공한다. 경기/MMR 보존은 설정 영역에서 한 번 설명하고 탈퇴 확인에는 실제 정리되는 정보와 재로그인 복귀만 설명한다. 실패 시 선택값을 보존하고 현재 참여·권한의 차단 이유를 탈퇴 버튼 옆에 둔다. 열린 선수 상세는 선택한 키만 유지하고 현재 데이터의 공개 표현을 사용한다.
- **MatchFilters:** 검색·기간·시즌은 한 폼에서 초안으로 고르고 조회에서 함께 적용한다. 날짜 입력은 native 달력·기존 color-scheme를 유지하고 한국 시간/미확인 날짜의 의미는 한 번 설명한다. 같은 조건의 쪽 이동은 미제출 초안을 보존하며, 잘못된 기간·0결과·범위 밖 쪽을 구분한다. 기존 SeasonSelector의 다른 사용처는 즉시 URL 조회를 유지한다.
- **GuildSeasonManagement:** 현재 시즌·전환·지난 시즌을 한 열의 별개 영역으로 구분한다. 전환의 보존/기본 MMR 안내는 폼에서 한 번만 제공하고 확인창에는 실제 현재와 새 이름을 표시한다. 긴 이름은 줄바꿈하고 확인 중 트리거를 비활성으로 바꾸지 않아 취소 후 포커스를 복원한다.409는 입력을 유지하면서 현재를 새로 읽어 다시 확인하게 한다.

- **StatsRefreshControls:** 통계의 지속 갱신은 aria-pressed가 있는 자동 토글과 일회 새로고침으로 구분한다. 조작은 최소44px이고 진행 중에도 자동 중지는 가능하다. 마지막 확인 시각은 한국 시간의 조용한 보조 정보이며 반복 성공은 발화하지 않는다. 실패·offline·수동 성공은 같은 상태 영역에 제공하고 정상 자료·정렬·쪽·열린 선택을 보존한다. 없는 챔피언 자료와 전체 빈 상태를 구분한다.

- **ChampionPreferences:** 다섯 포지션 중 한 목록을 검색·선택 순서·저장으로 편집한다. 선택한 챔피언은 검색 결과에서 제외해 같은 제거 조작을 중복하지 않는다. 다른 포지션의 초안은 유지하고 저장 중 검색 지우기·쪽 이동까지 잠근다. 순서 변경은 키 기반 DOM과 단일 상태 안내·포커스 복원을 사용한다. 카탈로그 실패와 선택 없음은 다른 상태이며 저장 실패는 입력을 보존하고 결과 불명은 재조회로 확인한다. 공개 설정에 따른 경매 표시만 안내하고 실제 주력·MMR를 선호로 대체하지 않는다.

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
