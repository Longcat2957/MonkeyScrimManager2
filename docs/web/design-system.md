# 디자인 시스템: STDF 사용 규칙

갱신일: 2026-11-03. 현재 설치된 `stdf@3.0.0`과 `apps/web/src`를 기준으로 한다. 패키지 선언은 `^3.0.0`이므로 의존성을 갱신하면 [7절](#7-stdf-300-제약과-대응)의 실제 소스·DOM을 다시 확인한다. 현재 구성과 향후 구현 기준을 구분하며, 접근성 보완의 존재만으로 모든 화면의 검증 완료를 뜻하지 않는다.

## 1. 선택 순서

새 UI는 STDF의 공식 컴포넌트·옵션을 먼저 확인하고, 서비스 공통 동작이 필요하면 기존 공통 컴포넌트·helper를 사용한다. STDF에 없는 의미 구조나 설치 버전의 제한은 필요한 범위의 네이티브 HTML로 보완한다.

- 버튼·입력·팝업 등의 기본 UI를 STDF로 해결할 수 있는데 다시 구현하지 않는다.
- 모든 STDF 컴포넌트에 일괄 래퍼를 만들지 않는다. 실제 반복과 공통 책임이 있는 범위만 추출한다.
- 반복 색·폰트·모서리는 전역 토큰을 사용한다. 현재 작업판에는 고정 줄 높이·최소 폭 같은 기능별 CSS 값이 있으며, 이를 모든 화면의 공통 토큰으로 간주하지 않는다.
- 상태를 색이나 호버 툴팁만으로 전달하지 않는다. 같은 동작·설명은 페이지 전체에서 한 번만 제공한다.
- 서비스 이름은 `#lib/branding.ts`의 `SERVICE_NAME`, 워드마크는 `font-brand`를 사용한다.

## 2. 루트 설정

`routes/+layout.svelte`는 `ConfigProvider locale={ko_KR}` 안에 본문 바로가기·`AppHeader`·`main`·`AppFooter`와 `Feedback`을 한 번씩 둔다. 스타일 진입점은 `routes/layout.css`다.

| 항목 | 현재 구현 |
| --- | --- |
| 스타일 | `@import 'tailwindcss'`, `@import 'stdf/source.css'`와 앱 `@theme` |
| 언어 | `stdf/lang`의 `ko_KR`. 설치 STDF의 기본 언어는 중국어 |
| 함수형 피드백 | 루트 `<Feedback />` 하나. `toast`와 `confirm` helper를 통한 `dialog.confirm` 사용 |
| 화면 모드 | `lib/ui/theme.ts`의 `currentMode`·`setMode` → `stdf/theme`의 `getMode`·`switchMode`. `primary`/`dark`를 `localStorage['theme-mode']`에 저장 |
| 첫 페인트 | `app.html`이 저장된 모드를 `html[data-mode]`에 복원. 저장소 접근 실패 시 기본 라이트 모드 유지 |
| 다크 변형 | `layout.css`의 `@custom-variant dark`와 다크 모드 토큰 덮어쓰기 |
| 글꼴·문서 | `html lang="ko"`, Google Fonts의 Noto Sans KR 400~800·Jersey 10 400, 기본 제목·application-name은 `SERVICE_NAME` |
| 정적 브랜드 | `static/brand/logo.png`, `favicon.png`. 로고 이미지는 이름 있는 홈 링크 안의 장식 이미지 |
| 아이콘 | 앱의 인라인 SVG·문자, `static/riot/positions/*.svg`, Data Dragon 이미지. 현재 `static/fonts/symbol.svg`는 없음. STDF 내장 SVG와 외부 symbol 아이콘은 구분해서 확인 |

## 3. 디자인 토큰

| 분류 | 실제 토큰·사용 |
| --- | --- |
| 주요색 | `--color-primary-*`·`--color-primary`, `--color-dark-*`·`--color-dark`: Slate 계열 단계 |
| 바탕 | `bg-bg-base` / `dark:bg-bg-base-dark` |
| 표면 | `bg-bg-surface`, `bg-bg-overlay`, `bg-bg-highlight`와 각각의 `-dark` |
| 글자 | `text-text-primary`, `dark:text-text-dark`, `text-text-on-primary`, `text-text-on-dark` |
| 경계 | `--color-border`, `--color-border-strong`. 다크 모드에서 혼합 비율과 바탕을 재정의 |
| 상태색 | `success`, `warning`, `error`, `info`. 다크 모드에서 밝게 재정의하고 문구와 함께 표시 |
| 순위색 | `medal-gold`, `medal-silver`, `medal-bronze`: 서버 순위 1~3위 숫자 배경 |
| 모서리 | `--radius-box: 0.75rem`, `--radius-form: 0.5rem`, `--radius-small: 0.25rem` |
| 글꼴 | `--font-sans`: Noto Sans KR, `--font-brand`: Jersey 10. 워드마크는 regular 400과 `font-synthesis:none` |
| 폭·높이 | `--app-header-width: 96rem`, `--app-content-width: 84rem`, `--app-header-height: 4rem` |
| 본문 틀 | `.app-frame`: 최대 84rem, 양옆 경계. 768px 이상은 화면에서 3rem, 미만은 0.5rem을 뺀 폭 |
| 문서 본문 | `.doc`: 최대 48rem, 제목·문단·목록 간격. 이용 안내·약관·개인정보 화면 공용 |
| 줄바꿈·포커스 | `html`의 `word-break: keep-all`·`overflow-wrap: anywhere`; 전역 `:focus-visible`의 2px 윤곽선·2px 간격 |

간격은 주로 Tailwind 기본 스케일을 사용한다. 코드에는 헤더·행에 필요한 개별 간격과 일부 회색 유틸리티도 있으므로 모든 디자인 값이 토큰으로만 통일된 상태는 아니다.

JavaScript의 데스크톱 분기는 `lg`(1024px) 하나이며 CSS 배치는 `sm`·`md`·`lg`·`xl`도 사용한다. `md`를 표 열 조정 전용으로 제한하지 않는다.

## 4. 용도별 컴포넌트 선택표

### 4.1 구조·표시

| 용도 | 현재 사용 | 참고 |
| --- | --- | --- |
| 헤더 | `NavBar` + 바깥 `<header>` | `leftChild`·`titleChild`·`rightChild`; 높이·배경은 `injClass`로 보정 |
| 기본 묶음 | `CellGroup`, 역할별 네이티브 영역 | 현재 작업판·지표·배경 아트는 각 역할에 맞는 section/div 구성. `Card`를 일괄 적용하지 않음 |
| 이동 행 | `LinkCell` | 링크 의미를 유지하며 STDF Cell 계열 모양 공유 |
| 작업 행 | `SwitchCell`, `ActionMenu`, STDF `Button` | `Cell` 자체는 버튼이므로 경로 이동 링크 대신 사용하지 않음 |
| 참가자 일괄 작업 | `List batchSelectable` | 평소 목록과 관리 모드를 분리; 보기 전용 행은 별도 `<ul>` |
| 상태 | `StatusTag` | STDF `Tag fill="light" size="sm"`의 장식 래퍼. 상태 대응은 [README](README.md#상태-값의-화면-문구) |
| 진행 단계 | `Steps` | `ScrimSummary`의 번호·완료 체크와 숨긴 `<ol>`; 간략 머리에는 미표시 |
| 신청 비율 | `Progress` | `NextScrimHero`의 신청 수/정원과 함께 표시. `percentPosition={null}`로 중복 수치 생략 |
| 지표 칸 | `Grids`·`Grid`·`StatTile` | 사용자 전적·서버 통계·경매 선수 지표 |
| 참가자 얼굴 | `PlayerFace`, `AvatarStack` | 얼굴 하나와 겹친 얼굴 묶음. 정적 이미지가 별도 동작을 만들지 않도록 구성 |
| 부가 정보 | `NoticeBar`, `Accordion` | 경매 이야기·구매 이력, 이용 안내 FAQ |
| 업적 캐러셀 | `AchievementCarousel` | 한 장의 카드·이전/다음 STDF Button·선택 점. 양옆 카드는 장식 |

### 4.2 입력

| 용도 | 현재 사용 | 참고 |
| --- | --- | --- |
| 제목·Riot ID·검색 | `Input` | 명시적 `placeholder`, 표시 라벨 `title`, 오류 `state`·`tip`. 입력 이름·오류의 접근성 연결은 별도 점검 필요 |
| 숫자 직접 입력 | `Input` | 값은 문자열. STDF `type="number"`는 숫자 키보드 유도이며 형식·범위는 직접 검증 |
| 작은 범위 정수 | `Stepper` | 팀 수·추가 신청 정원. `min`·`max`는 `features/scrims/settings.ts` 기준 |
| 단일·다중 선택 | `Radio`·`Checkbox` | 계정·팀·희망 포지션 등. 그룹은 `<fieldset><legend>` |
| 켜짐/꺼짐 | `SwitchCell` | 헤더의 화면 모드 변경과 모집 설정 폼의 하드 피어리스 바인딩. 변경 책임은 호출 컴포넌트 |
| Discord 역할·채널 | `DiscordSettingRow`·`ActionMenu` | 현재 값 버튼으로 선택 목록을 열고 고르면 저장 |
| 날짜 | `Calendar popup={null}` | `ScrimSettingsDialog` 안에 펼침. 선택 결과 형식은 `YYYY-MM-DD` |
| 시각 | `Input` | `HH:mm` 문자열과 직접 형식 검증 |
| ROFL 파일 | 숨긴 `<input type="file">` + `ImageList` | 선택 파일을 `addFiles()`로 전달. `itemChild`의 내장 상태 표시 제한은 [7절](#7-stdf-300-제약과-대응) 참고 |

저장 폼은 네이티브 `<form>`·SvelteKit `enhance`를 사용하고 선택 컨트롤의 기본 제출은 `nonSubmitButtons`로 보정한다. 모든 입력을 STDF `Form`으로 통일한 구조가 아니다.

### 4.3 탐색·전환

| 용도 | 현재 사용 | 참고 |
| --- | --- | --- |
| 같은 화면의 보기·필터 | STDF `Tab` | `labels`, `active`, `onclickTab`. URL에 둘 상태와 컴포넌트 상태 구분 |
| 페이지 번호 | `PageNav` | STDF `Pagination`의 이름·현재 쪽 보정. `pageSize`는 필수 prop이며 기본값 없음 |
| 순위 추가 조회 | `InfiniteScroll` | `RankingBoard` 내부 스크롤. `loading`을 호출자가 켜고 끝나면 끄며 한국어 문구 제공 |
| 다음 내전 남은 시간 | `CountDown` | 마운트 후 렌더링, 매초 변하는 표시는 `aria-hidden` |
| 경로 이동 | `<a>`, `LinkCell`, `ContextNav` | 새 탭·주소 복사 가능한 링크. 헤더 ActionMenu 항목은 `goto`로 이동 |

`Tab`의 `showNum`은 배지 수가 아니라 동시에 보여 주는 탭 칸 수다. 참가자 목록은 명시하지만 모든 사용처가 전체 탭 수를 지정하는 것은 아니다. 긴 라벨·좁은 화면은 실제 렌더링을 확인한다.

### 4.4 오버레이·피드백

| 용도 | 현재 사용 | 참고 |
| --- | --- | --- |
| 입력 팝업 | `Popup` + `overlay` | 데스크톱 center·모바일 bottom, `transparent`와 내부 내용 상자 |
| 메뉴 | `ActionMenu` | 데스크톱 `ActionPopover`, 모바일 `ActionSheet`; 마운트 후 렌더링 |
| 모바일 메뉴 | `Popup position="right"` | `AppHeader`의 80% 폭 패널 |
| 선수 상세 | `GamePlayerDialog` | 데스크톱 right·모바일 bottom |
| 확인 | `confirm()` | `dialog.confirm`에 Escape·포커스 복귀만 보완. 중첩 접근성을 보장하는 공통 dialog 관리자는 아님 |
| 일시적 결과 | `toast.success`·`toast.error` | 이미 화면에 보이는 결과를 반복하지 않는 것이 작성 기준 |
| 대기·실패·빈 상태 | `SectionState`, 필요한 인라인 `Loading` | 루트 공통 live region은 없고 해당 기능의 안내 영역을 사용 |

`loading.show()`로 전체 화면을 차단하는 방식은 현재 업무 화면에서 사용하지 않는다. 닫기 정책과 포커스 한계는 [patterns.md](patterns.md#4-오버레이)를 따른다.

### 4.5 현재 선택하지 않은 구성

하단 `TabBar`, 드래그 단계형 `BottomSheet`, 휠 기반 Picker·TimePicker, STDF `Form`, 직접 렌더링하는 `Dialog`·`Modal`, 개인 얼굴용 `Avatar`는 제품 화면에 사용하지 않는다. 경로 이동은 링크, 확인은 `confirm`, 날짜·시각은 달력과 입력, 얼굴은 `PlayerFace`로 구현되어 있다.

새 기능이 생기면 설치 버전 API와 접근성을 확인해 선택한다. 이 목록에 없다는 이유만으로 사용하지 않는 STDF 컴포넌트를 미리 화면에 추가하지 않는다.

## 5. 서비스 공통 컴포넌트

실제 파일이 있는 구성만 기록한다. 기능별 컴포넌트는 `lib/components/<영역>/`에 두며 여러 곳에서 반복되지 않는 작업판을 공통 UI로 추상화하지 않는다.

| helper | 위치 | 실제 책임 |
| --- | --- | --- |
| `overlay` | `lib/ui/overlay.ts` | 열린 래퍼의 dialog 속성·바깥 inert·스크롤 잠금·초기 포커스 재시도·Escape·기존 포커스 복귀. Tab 순환·트리거 소멸 fallback 없음 |
| `nonSubmitButtons` | `lib/ui/form.ts` | 폼의 타입 없는 버튼에 `type="button"` 설정, DOM 변경 감시 |
| `confirm` | `lib/ui/confirm.ts` | STDF `dialog.confirm` 호출, Escape 닫기·기존 포커스 복귀 |
| `postAction` | `lib/ui/actions.ts` | 이름 있는 form action POST·결과 해석·성공 또는 네트워크 예외 뒤 최신화. 409 공통 처리 없음 |
| `desktop`·`markHydrated` | `lib/ui/viewport.svelte.ts` | 1024px MediaQuery를 루트 마운트 이후에만 노출. SSR은 모바일 |
| `setMode`·`currentMode` | `lib/ui/theme.ts` | 화면 모드 변경·조회·저장 |
| `avatarColor`·`initialAvatarUrl` | `lib/ui/avatar.ts` | 이름 기반 얼굴 대체색과 이니셜 SVG data URL |

| 공통 컴포넌트 | 위치 | 실제 인터페이스·책임 |
| --- | --- | --- |
| `AppHeader`·`ContextNav`·`MenuButton`·`AppFooter` | `lib/components/layout/` | 루트 헤더·범위 링크·메뉴 트리거·푸터. 항목 생성은 `navigation.ts`, 사용자·서버 메뉴는 `AppHeader` |
| `ActionMenu` | `lib/components/common/` | `open` 바인딩, `label`, `actions`, `trigger`, `onselect`. 데스크톱 popover·모바일 sheet와 overlay 보완 |
| `LinkCell` | 같은 폴더 | `href`, `title`/`titleChild`, `subTitle`, `detail`/`detailChild`, `info`/`infoChild`, `leftChild`, `line`. 오른쪽 정보는 제목·부제 줄에 맞춤 |
| `StatusTag` | 같은 폴더 | `text`, `state`. 장식 Tag와 숨긴 상태 문구 |
| `DateBadge` | 같은 폴더 | `iso`, `emptyText`. 월·일 또는 날짜 없음 표시 |
| `SwitchCell` | 같은 폴더 | `title`, `subTitle`, `active` 바인딩, `disabled`, `line`, `leftChild`, 선택적 `onchange`. label 안의 Switch 하나 |
| `SectionState` | 같은 폴더 | `loading`+선택적 `lines`, `empty`+`message`, `error`+`message`·`onretry`. 정상 상태 prop은 없음 |
| `PageNav` | 같은 폴더 | `total`, `pageSize`, `current`, `onchange`, 선택적 `label`. 한 쪽이면 숨김; 데스크톱 최대 7·모바일 5개 번호, 한국어 이름·현재 쪽 보정 |
| `PlayerFace` | 같은 폴더 | `name`, `imageUrl`, `size=sm\|md\|lg`. 이미지 또는 이름 첫 글자 장식 |
| `PlayerName` | 같은 폴더 | `guildId`, `displayName`, `userId`, `imageUrl`, 선택적 `riotId`·`link`. 연결된 사용자일 때만 전적 링크 |
| `AvatarStack` | 같은 폴더 | `people`, `total`, `max=5`, `size=xs\|sm`. SSR 자리 확보·마운트 후 AvatarGroup·정확한 남은 수 |
| `PositionIcon` | 같은 폴더 | `position`, `size=sm\|md\|lg`. 로컬 Riot 라인 아이콘; 이름은 호출자가 별도 제공 |
| `StatTile` | 같은 폴더 | `label`, `value`, 선택적 `note`·`tone`·`icon`. tone은 지표 묶음의 장식이며 좋고 나쁨을 의미하지 않음 |

기능별 구성은 다음 파일들과 페이지 문서를 기준으로 한다.

| 영역 | 구성 |
| --- | --- |
| 서버 홈 | `NextScrimHero`, `ActivityBoard`, `RankingBoard`; 통계 영역의 `AchievementCarousel` 재사용 |
| 내전 요약·참가 | `ScrimSummary`, `ScrimListRow`, `ScrimSettingsDialog`, `ScrimOperationsBar`, `MyRegistrationBar`, `RegistrationDialog`, `ParticipantBoard`, `PositionChips`, `FormationMethodChooser` |
| 수동 편성·경매 | `ManualFormationBoard`, `FormationTeamCard`, `FormationPool`, `FormationSynergyRail`, `FormationHeadToHead`, `AuctionSetupBoard`, `AuctionDraftBoard`, `AuctionTeamCard`, `AuctionTargetProfile`, `CandidateListDialog`, `ChangeMethodButton`; 드래그 상태는 `drag.svelte.ts`의 `DragState` |
| 대진 | `BracketBoard`, `BracketMatchBox`, `BracketTeamContent`, `BracketFormatControl` |
| 경기 | `MatchListRow`, `MatchTable`, `GameHero`, `GameTeamTable`, `GamePlayerDialog`, `RoflUploadDialog`, `LoadoutIcon` |
| 사용자 전적·통계 | `DuoList`, `RadarChart`, `LeaderboardTable`(PageNav 사용), `AchievementCarousel`, `AchievementRankingDialog` |
| 내 정보·서버 관리 | `RiotAccountList`, `MemberRiotAccountsDialog`, `DiscordSettingRow` |

공통 `ChampionIcon` 컴포넌트는 없다. 챔피언 이미지는 각 기능의 `<img>`와 서버에서 준비한 이미지 URL로 표시한다.

### 5.1 작업판 레이아웃 (팀 편성·경매·대진)

- 수동 편성·경매·대진은 테두리와 `bg-border` 바탕, `gap-px`와 각 영역 표면색을 조합한 작업판을 사용한다.
- 수동 편성은 미배정 타일과 팀 자리, 선택적 시너지·상대 전적을 한 판에 둔다. 구성에 따라 30rem 또는 56rem 최소 폭을 두고 안쪽에서 가로로 스크롤한다.
- 경매 진행은 `xl`에서 52rem 높이와 후보/팀 패널의 열 배치를 적용하고 각 영역에서 스크롤한다. 작은 화면은 세로 배치하며 팀은 `md`에서 두 열이다.
- 대진의 팀 풀은 편집 중에만 표시하고 `lg`에서 작업판 왼쪽에 둔다. 라운드는 여러 개면 `md`에서 두 열로, 작은 화면에서는 세로로 배치한다.
- 수동 편성·대진은 HTML5 드래그와 클릭/탭 선택·배치를 함께 제공한다. 경매 유찰자는 후보 목록 팝업의 팀 배치 버튼을 사용할 수 있지만, 현재 후보의 무료 수동 배치는 드래그 전용이다. 일반 입찰·낙찰 버튼과 별개로 이 동작에는 터치·키보드 대안이 아직 없다.
- `ScrimSummary`는 요약·수동 편성에서 전체 머리, 경매·대진·결과에서 `compact`다.

## 6. 네이티브 HTML을 쓰는 곳

| 경우 | 현재 요소·이유 |
| --- | --- |
| 경로 이동 | `<a>`: STDF에는 해당 링크 구성이 없음. `LinkCell`·`ContextNav`·본문 이동 |
| 다열 수치 | `<table>`·`caption`·`th`: 게임 수치·통계·사용자 기록의 비교와 정렬 |
| 선택 타일 | `<button>`·`aria-pressed`: 편성 방식·참가자·자리·대진 팀의 선택 상태와 상세 내용. 배정 해제는 별도 형제 조작 |
| 표 정렬·캐러셀 점·업적 선택 | 네이티브 버튼: 의미 있는 현재 정렬/선택과 작은 시각 요소의 조작 영역. 일반 작업 버튼은 STDF 사용 |
| 폼·파일 입력 | `<form>`·`fieldset`·`legend`와 숨긴 `<input type="file">`: 제출·그룹·파일 선택 |
| 이미지·차트 | `<img>`·인라인 SVG. `RadarChart`는 `role="img"`, 이름과 숨긴 축별 수치 목록 |
| 문서·정적 영역 | 제목·문단·목록·정의 목록·역할별 section/header/footer |

공개 STDF API로 같은 역할을 충분히 구현할 수 있는지 먼저 확인한다. 네이티브 요소도 토큰·키보드 이름·포커스를 함께 고려한다.

## 7. STDF 3.0.0 제약과 대응

설치 패키지의 `dist/components`, `dist/types` 및 `@any-tdf/common`의 파생 스타일을 기준으로 한다. 이 표는 실제 앱 보완과 아직 남은 한계를 함께 기록한다.

| 확인된 제약·특성 | 현재 대응·한계 |
| --- | --- |
| `Cell` 오른쪽 Switch는 행 버튼 안에 Switch 버튼이 중첩됨 | `SwitchCell`의 label + Switch로 구성 |
| `Tag`는 동작이 없어도 `role="button"`·tabindex를 가짐 | `StatusTag`에서 `inert aria-hidden`으로 장식화하고 텍스트 별도 제공 |
| `AvatarGroup` 내부 버튼 중첩, `image` 기반 each 키, `top="totle"`는 전체 수 표시 | `AvatarStack`은 마운트 후 렌더링·inert·고유 fragment/이니셜 URL·남은 수 snippet. 루트 너비도 계산 |
| `Avatar`는 버튼이며 `alt`는 이미지 대체 텍스트 속성과 다른 대체 표시 | 직접 사용하지 않고 `PlayerFace` 등 정적 이미지 구성 |
| `ActionPopover`는 DOM을 참조하며 SSR 종료에도 `document` 사용 | `ActionMenu`가 마운트 후에만 렌더링. 모바일은 `ActionSheet` |
| Popup·확인창에 앱이 필요한 dialog 의미·포커스·배경 차단이 모두 내장되어 있지 않음 | Popup/Menu는 `overlay`, 확인은 `confirm`. 두 helper의 보완 범위가 다르며 Tab 순환·중첩 확인은 미해결 검증 대상 |
| `Button`·`Input` 등은 임의 HTML 속성을 그대로 전달하지 않음 | `injClass`·공개 prop·snippet·외부 래퍼 사용. 모든 컴포넌트가 모든 `aria-*`를 지원하지 않는다고 일반화하지 말고 해당 타입 확인 |
| `Input` 제목이 네이티브 label로 연결되지 않고 `name`도 없음 | formData 직접 구성. 프로그램적 이름·오류 연결은 별도 보완 필요 |
| `Switch`·`Radio`·`Checkbox`에 기대하는 선택 상태 ARIA가 없음 | 그룹 legend·현재 상태 문구 사용. 네이티브 라디오/체크박스 의미를 완전히 대체하지 않음 |
| `Tab`에 tablist·aria-selected 패턴이 없음 | 그룹 이름·선택한 내용의 제목/목록 이름 보완. 완전한 탭 키보드 패턴은 아님 |
| `Button size="md"\|"sm"`은 현재 스타일에서 실질 크기 규칙이 부족함 | 제품 버튼은 주로 `auto`·`full`; `auto`에는 `injClass` 가로 여백. `heightIn`은 패딩이며 고정 높이 아님 |
| `Button disabledLoading` 기본값은 true | `loading={pending ? {} : null}`로 해당 버튼 자동 비활성 |
| `Button fill="text"`는 상태색을 사용하지 않음 | 위험 텍스트 작업은 `textState`·`state="error"` |
| `Button`은 `onclick` 외 임의 이벤트를 전달하지 않음 | 경매 증감의 우클릭은 외부 `span role="presentation"`에서 처리 |
| `Input`은 password 외 네이티브 type이 text이고 `onkeydown`은 key 문자열만 전달 | 숫자·시각 검증 직접 구현. 폼 수준 조합 중 Enter 방지는 별도 필요 |
| 한국어 Input 기본 `pleaseInput`에 비밀번호 문구가 포함됨 | 실제 입력별 placeholder 명시 |
| `Checkbox`·`Radio`·`Stepper` 내부 일부 버튼에 type이 없음 | 해당 폼의 `nonSubmitButtons`; 제출 Button은 `type="submit"` |
| `Input` 바깥 여백 때문에 같은 줄 정렬이 어긋날 수 있음 | 경매 입력처럼 필요한 곳에 외부 음수 여백 보정 |
| `Popup position="center"`는 넓은 패널이며 px·py는 화면 가장자리 간격 | `transparent`, 내부 내용 상자의 최대 폭·배경·여백 사용 |
| `ImageList`는 파일 입력을 제공하지 않음 | 숨긴 파일 입력을 열어 `addFiles()` 호출 |
| `ImageList itemChild`가 있으면 기본 항목 분기의 상태·삭제·재시도 UI와 `statusChild`가 렌더링되지 않음 | ROFL은 현재 파일명·크기만 보이고 결과는 숨긴 live 목록에 전달. 시각적 파일 상태·개별 재시도 구현은 남아 있음 |
| `ImageList` 기본 radius가 `--radius-btn`을 참조 | ROFL은 `radius="md"` 명시. 선택 칸은 uploadChild로 제공하여 별도 sprite 없이 표시 |
| `ImageList` 일부 기본 Icon은 외부 symbol 경로를 사용할 수 있으나 다른 내장 아이콘은 SvgIcon임 | 현재 앱에는 sprite가 없으므로 사용한 분기·snippet을 확인. 모든 내장 아이콘이 sprite를 요구한다고 가정하지 않음 |
| `Steps current`는 1부터 시작하고 가로 모드에는 desc가 표시되지 않음 | 모집 1·편성 2·대진 3·진행 4·완료 6. 중도 종료·취소에는 단계 생략, 번호·체크와 숨긴 ol 사용 |
| `Grids`에는 injClass가 없음 | 열 수를 `desktop.current`로 전달하거나 기능별 CSS grid 사용 |
| `NavBar` 기본 높이·배경은 h-12·white/black | 앱의 4rem 높이·투명 배경을 `injClass`의 `!`로 보정 |
| `NoticeBar`에는 rightIcon=null일 때도 오른쪽 버튼이 남음 | 경매에서 전체를 `inert aria-hidden` 처리하고 별도 숨긴 이야기 목록. 내용 변경 시 key로 재생성 |
| `Pagination` 번호 폭은 부모 폭에 의존하고 이전/다음 이름이 pre/next임 | `PageNav`가 슬롯 수에 맞춘 최대 폭·한국어 이름·aria-current 보정. 작은 화면 실제 크기는 별도 확인 |
| `List` 일괄 선택 칸이 행을 밀고 보기 모드에도 편집 전환을 제공 | 참가자 관리 모드에서만 렌더링하고 오른쪽 여백을 보정 |
| `Accordion` 머리에 aria-expanded가 없음 | 경매 기록·이용 안내 FAQ에 사용하며 펼침 상태의 접근성 보완은 남아 있음 |
| `Toast`·Loading 등 모든 상태 알림에 live region이 있지는 않음 | SectionState alert, ROFL 결과·정원 등 기능별 안내. 루트 공통 status는 없음 |

`sr-only`는 절대 위치이므로 스크롤 영역의 가까운 positioned 조상이 중요하다. `LinkCell`과 여러 작업판·표의 `relative`는 숨긴 텍스트가 문서 높이를 늘리지 않도록 하는 앱 CSS 보완이다. 이는 STDF API 자체의 제약과 구분한다.
