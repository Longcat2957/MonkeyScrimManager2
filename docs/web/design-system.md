# 디자인 시스템: STDF 사용 규칙

작성일: 2026-10-30. 기준: 설치된 `stdf@3.0.0` (`apps/web/node_modules/stdf`). 버전을 올리면 [7절](#7-stdf-300-제약과-대응)을 다시 확인한다.

## 1. 선택 순서

UI 하나를 만들 때 아래 순서로 처음 해결되는 단계를 쓴다.

1. **STDF 컴포넌트** — [4절 선택표](#4-용도별-컴포넌트-선택표)에서 고른다.
2. **STDF 함수형 API** — `toast`, `dialog`, `loading` (루트의 `<Feedback />`가 렌더링).
3. **서비스 공통 컴포넌트** — STDF를 조합한 것. [5절](#5-서비스-공통-컴포넌트)에 있는 것만 만든다.
4. **네이티브 HTML** — [6절](#6-네이티브-html을-쓰는-곳)의 다섯 경우만.

금지:

- STDF가 있는 UI(버튼·입력·탭·팝업·태그·스켈레톤 등)를 `<button class="...">`, `<details>`, 수제 CSS로 다시 만들기.
- STDF 컴포넌트마다 `AppButton`·`AppInput` 같은 일괄 래퍼 만들기.
- 컴포넌트 `<style>` 블록에 색상·간격 하드코딩. 토큰과 Tailwind 유틸리티, STDF prop(`injClass` 포함)으로 해결한다.
- 사용자에게 보이지 않는 상태(호버 툴팁 전용 정보, 색상만으로 구분되는 상태).

## 2. 루트 설정

`routes/+layout.svelte`에 다음을 둔다.

```svelte
<script lang="ts">
	import { ConfigProvider, Feedback } from 'stdf';
	import { ko_KR } from 'stdf/lang';
</script>

<ConfigProvider locale={ko_KR}>
	<!-- 본문 바로가기 · AppHeader · main · AppFooter -->
	<Feedback />
</ConfigProvider>
```

| 항목 | 규칙 |
| --- | --- |
| 언어 | `ConfigProvider locale={ko_KR}` 한 곳. 컴포넌트마다 문구 prop으로 언어를 반복하지 않는다. 기본값이 중국어이므로 빠뜨리면 안 된다 |
| 함수형 피드백 | `<Feedback />`는 루트에 하나. `toast`·`dialog`는 어디서든 호출 |
| 화면 모드 | `stdf/theme`의 `switchMode('primary' \| 'dark')`로 `html[data-mode]`를 바꾸고 `localStorage['theme-mode']`에 저장. 첫 페인트 복원은 기존 `app.html` 스크립트 유지 |
| 테마 토큰 | `routes/layout.css`의 `@theme`가 유일한 출처. STDF가 쓰는 `--color-primary-*`, `--color-dark-*`, `--color-bg-*`, `--color-text-*`, 상태색, `--radius-box/form/small`을 여기서 정의한다 |
| 다크 변형 | `@custom-variant dark`(이미 있음). STDF는 dark 변형을 제공하지 않으므로 지우지 않는다 |
| 아이콘 | `Icon type="symbol"`은 `static/fonts/symbol.svg` 스프라이트를 읽는다. 쓰는 아이콘만 담은 스프라이트를 `static/fonts/symbol.svg`로 둔다. 외부 아이콘 API(iconify)는 쓰지 않는다 |

## 3. 디자인 토큰

이미 `layout.css`에 정의된 값을 쓴다. 새 값이 필요하면 `@theme`에 토큰을 추가하고 이 표를 갱신한다.

| 분류 | 토큰·유틸리티 | 용도 |
| --- | --- | --- |
| 바탕 | `bg-bg-base` / `dark:bg-bg-base-dark` | 페이지 바탕 |
| 표면 | `bg-bg-surface`, `bg-bg-overlay`, `bg-bg-highlight` (+`-dark`) | Card·Popup·선택 행 |
| 글자 | `text-text-primary` / `dark:text-text-dark`, 보조 문구는 `opacity-70` | |
| 경계 | `border-border`, `border-border-strong` | 구분선·표 |
| 상태색 | `success` `warning` `error` `info` | `Tag`·`Button state`·오류 문구. 반드시 문구와 함께 |
| 모서리 | `--radius-box`(0.75rem) · `--radius-form`(0.5rem) · `--radius-small`(0.25rem) | STDF `radius` prop 기본값이 이 토큰을 쓴다 |
| 글꼴 | `font-sans`(Noto Sans KR), `font-brand`(Jersey 10, 워드마크 전용) | |
| 폭 | `--app-content-width` 84rem(본문), 읽기 화면 `max-w-3xl`(48rem) | |
| 헤더 | `--app-header-height` 4rem | |

간격은 Tailwind 기본 스케일만 쓴다: 영역 사이 `gap-8`(모바일 `gap-6`), 영역 안 `gap-4`, 라벨·값 사이 `gap-2`.
브레이크포인트는 Tailwind `lg`(1024px) 하나를 데스크톱 기준으로 쓴다. `md`는 표 열 수 조정에만 쓴다.

## 4. 용도별 컴포넌트 선택표

### 4.1 구조·표시

| 용도 | 사용 | 메모 |
| --- | --- | --- |
| 앱 헤더 틀 | `NavBar` | `left={null}`, `leftChild`·`titleChild`·`rightChild` 스니펫. 루트가 `<div>`이므로 바깥을 `<header>`로 감싼다 |
| 업무 단위 묶음 (팀, 대진 한 칸, 설정 그룹, 현재 경매 후보) | `Card` | `header`·`footer` 스니펫, `shadow="none"`, `border` 사용. 내부에 버튼·링크가 있으면 `onclick`을 주지 않는다(카드 전체가 `<button>`이 됨) |
| 설정·정보 행 목록 | `CellGroup` + `Cell` | `title`/`subTitle`/`detail`/`info`. 행 전체가 버튼이므로 **동작**(팝업 열기, 토글)에만 쓴다. 페이지 이동 행은 `LinkCell` |
| 일괄 선택이 필요한 목록 | `List` | `batchSelectable` + `batchActions`로 다중 선택 작업(참가자 선발·대기). `onclickItem`이 없으면 행이 disabled 버튼이 되므로 보기 전용 목록에는 쓰지 않는다 |
| 상태 표시 | `StatusTag` (STDF `Tag` `fill="light" size="sm"`) | `state`는 [README 대응표](README.md#상태-값의-화면-문구). STDF `Tag`를 직접 쓰지 않는다([7절](#7-stdf-300-제약과-대응)) |
| 개수 표시 | `Badge` 또는 `Tab` 라벨 텍스트 | 탭 옆 개수는 라벨에 `전체 13`처럼 쓴다. `showNum`은 개수가 아니라 보이는 탭 칸 수다([7절](#7-stdf-300-제약과-대응)) |
| 진행 단계 | `Steps` | 내전 운영 단계(모집→편성→대진→진행→종료), 서비스 소개의 흐름. 번호 `step.bar` + `✓` `finishStep.bar` + `radius="full"`로 완료·현재·예정을 구분하고, 보조기기용 `<ol aria-current="step">`을 함께 둔다 |
| 비율·잔여량 | `Progress` | 신청/정원, 경매 잔여 포인트. `percentPosition={null}`로 두고 수치는 옆 텍스트로 쓴다 |
| 구분선 | `Divider` | 텍스트 구분이 필요할 때만. 단순 경계는 `border-b border-border` |
| 숫자 지표 칸 배치 | `Grids` + `Grid` | 통계 핵심 지표, 사용자 전적 요약 |
| 사람 묶음 미리보기 (목록 행의 참가자 얼굴) | `AvatarStack` (STDF `AvatarGroup`) | 장식으로만 쓴다. 인원수는 옆 문구가 전달하고 보조기기에는 이름 목록만 읽힌다. 모바일 목록 행에서는 생략 |
| 부가 이력 접기 | `Accordion` | 경매 구매 이력, 문서 FAQ. 현재 작업에 필요한 정보는 접지 않는다 |

### 4.2 입력

모든 입력은 네이티브 `<form>` 안에 둔다([patterns.md 3절](patterns.md#3-폼)). STDF `Form` 컴포넌트는 쓰지 않는다 — `<form>` 요소·필드별 오류·`name`이 없어 제출·검증을 다시 만들어야 하기 때문이다.

| 용도 | 사용 | 메모 |
| --- | --- | --- |
| 한 줄 텍스트 (제목, Riot ID, 팀 이름) | `Input` | `title`(라벨, `titlePosition="out"`), `placeholder`, `maxlength`, `state="error"` + `tip`(오류 문구), `required` |
| 검색 | `Input` | `type="search"`, `label1`에 검색 아이콘, `clear`. Enter로 제출 |
| 숫자 직접 입력 (낙찰가, 포인트) | `Input` | `type="number"`(실제로는 `inputmode`만 바뀌고 값은 문자열). 범위 검증은 직접 |
| 작은 범위 정수 (팀 수 2~4, 추가 정원 0~10) | `Stepper` | `min`·`max`·`step`. 값 칸은 편집 불가이므로 범위가 넓으면 `Input` |
| 상호 배타 선택 2~5개 (편성 방식, 팀, 포지션) | `Radio` | `layout="h"`, 그룹 라벨은 감싸는 `<fieldset><legend>` |
| 다중 선택 (희망 포지션) | `Checkbox` | 그룹 라벨은 `<fieldset><legend>` |
| 즉시 반영 on/off (공개 설정, 관리자 권한) | `SwitchCell` (STDF `Switch` `inside="state"`) | 행 전체가 label이라 어디를 눌러도 토글. `onchange`에서 저장, 실패 시 되돌리고 저장 중 `disabled`. Cell의 `right: switch`는 쓰지 않는다 |
| 6개 이상 중 하나 (Riot 계정, 채널) | `ActionSheet` | `Input readonly`(현재 값 표시)를 눌러 연다. 선택 시 값 반영 |
| 날짜 | `Calendar` | `mode="single"`. 입력 팝업 안에서는 `popup={null}`로 입력 아래에 펼친다(팝업 중첩 금지). `outFormat="YYYY-MM-DD"`. 시각은 아래 `Input`으로 분리 |
| 시각 | `Input` | `HH:mm` 직접 입력 + 형식 검증. `TimePicker` 휠은 키보드로 조작할 수 없어 쓰지 않는다 |
| 파일 (ROFL) | `ImageList` | `accept=".rofl"`, `itemChild`로 파일명·크기 표시, `status`로 파일별 업로드 상태. [7절](#7-stdf-300-제약과-대응) 확인 후 사용 |

### 4.3 탐색·전환

| 용도 | 사용 | 메모 |
| --- | --- | --- |
| 같은 페이지 안의 보기 전환 (상태 필터, 게임 선택, 포지션 필터, 라운드) | `Tabs`/`Tab` | `labels`, `showNum`(칸 수, 기본 3), `onclickTab`. URL 상태면 `goto`로 동기화. **라우트 이동에는 쓰지 않는다** |
| 2~3개의 짧은 보기 전환을 툴바 안에서 | `ButtonGroup` | 탭 줄을 둘 공간이 없을 때만 |
| 페이지 번호 | `Pagination` | `total`, `pageSize=20`, `current`, `onchange` → `goto(?page=)`. 주소로 공유·복원해야 하는 목록용 |
| 카드 안 긴 목록 | `InfiniteScroll` | `scrollTarget`에 카드 안 스크롤 요소. `onload`에서 **`loading = true`를 직접 켜고** 끝나면 끈다(그래야 다음 호출이 풀림). 한국어 문구가 없어 `loadingText` 등을 넘긴다. 예: 서버 순위 |
| 남은 시간 | `CountDown` | 브라우저 시각 기준이라 마운트 후에만 렌더링. 매초 바뀌므로 `aria-hidden` |
| 페이지 간 이동 | `<a>` / `LinkCell` | STDF에 링크 컴포넌트가 없다([6절](#6-네이티브-html을-쓰는-곳)) |

### 4.4 오버레이·피드백

모든 오버레이는 `overlay` attachment를 붙인 래퍼 안에 둔다([5절](#5-서비스-공통-컴포넌트)).

| 용도 | 사용 | 메모 |
| --- | --- | --- |
| 입력 작업 팝업 (모집 생성, 계정 추가, 편성 배정, 낙찰 기록, ROFL 업로드) | `Popup` | 데스크톱 `position="center"`, 모바일 `position="bottom"`. `maskClosable`은 입력이 없을 때만 true |
| 작은 메뉴 (서버 선택, 계정 메뉴, 행 작업 메뉴) | `ActionMenu` (데스크톱 `ActionPopover` + `triggerRef`, 모바일 `ActionSheet`) | `ActionPopover`에는 하단 시트 모드가 없다. 비활성 항목은 `desc`로 이유를 쓴다 |
| 모바일 작업 목록 | `ActionSheet` | `ActionMenu`가 모바일에서 사용. `showCancel`로 취소 버튼을 둔다 |
| 모바일 상세 보기 (게임 참가자 상세) | `Popup position="bottom"` | 데스크톱은 같은 `Popup`을 `position="right"`로 |
| 확인 (삭제·제외·권한 회수·편성 확정) | `confirm(내용, 제목)` (`lib/ui/confirm.ts`) | STDF `dialog.confirm`에 Escape 닫기·포커스 복귀를 더한 헬퍼. `Promise<boolean>`. `Dialog` 컴포넌트를 직접 렌더링하지 않는다 |
| 일시적 결과 알림 | `toast.success / .error` | 결과가 화면에 이미 보이면 띄우지 않는다([patterns.md 1절](patterns.md#1-상태-표현)) |
| 전체 화면 차단 로딩 | 쓰지 않음 | `loading.show()` 금지. 버튼의 `loading`으로 표시 |
| 최초 로딩 자리 | `Skeleton` | `type="p"`(문단), `type="div"`(카드 형태) |
| 부분 갱신·인라인 대기 | `Loading` | 작은 크기, 영역 제목 옆 |

### 4.5 쓰지 않는 컴포넌트

| 컴포넌트 | 이유 |
| --- | --- |
| `Form` | 위 4.2 참고 |
| `Modal`, `Dialog`(직접 렌더링), `Alert`/`showAlert` | 확인은 `confirm()`, 알림은 `toast`로 통일 |
| `Avatar` | 루트가 항상 이름 없는 `<button>`이고 접근 가능한 이름을 줄 방법이 없다. 프로필 사진은 `<img>`, 계정 메뉴 트리거는 `Button` |
| `Picker`, `AsyncPicker`, `TimePicker` | 휠이 키보드로 조작되지 않음. 선택은 `Radio`/`ActionSheet`, 시각은 `Input` |
| `TabBar` | 하단 탭바를 두지 않는다 |
| `BottomSheet` | 드래그 단계형 시트가 필요한 화면이 없다. `Popup position="bottom"` 사용 |
| `PullRefresh` | 웹에서 당겨서 새로고침 형태가 필요 없다. 한국어 문구도 없음 |
| `NoticeBar` | 흐르는 공지 형식이 필요한 정보가 없다 |
| `Tooltip` | 필요한 정보는 화면에 쓴다 |
| `Swiper` | 슬라이드에 컴포넌트만 받고 데이터(props)를 넘길 수 없으며 키보드로 넘길 수단이 없다. 캐러셀은 가로 스크롤 스냅 + 이전/다음 `Button`(`StoryCarousel`) |
| `CharRoll`, `Rate`, `Slider`, `ColorPicker`, `Signature`, `CodeInput`, `NumKeyboard`, `FullKeyboard`, `IndexBar`, `ImagePreview`, `ProgressLoop`, `Placeholder`, `Mask`(단독) | 대응하는 서비스 기능이 없다. 기능이 생기면 이 표에서 옮긴다 |

## 5. 서비스 공통 컴포넌트

이 목록 외의 공통 컴포넌트는 실제로 두 곳 이상에서 반복될 때 추가하고 이 표에 적는다. 페이지 한 곳에서만 쓰는 구성은 페이지 폴더(`lib/components/<영역>/`)에 둔다.

| 이름 | 위치 | 구성 | 책임 |
| --- | --- | --- | --- |
| `overlay` (attachment) | `lib/ui/overlay.ts` | 래퍼 `<div>`에 `{@attach overlay({ open, label, onclose })}` | 열릴 때 `role="dialog"`·`aria-modal`·`aria-label`, 바깥 요소 `inert`, 첫 포커스(패널이 실제로 보일 때까지 재시도), `Escape` → `onclose`, `body` 스크롤 잠금, 닫힐 때 여는 버튼으로 포커스 복귀. `Popup`·`ActionPopover`에 사용 |
| `nonSubmitButtons` (attachment) | `lib/ui/form.ts` | `<form {@attach nonSubmitButtons}>` | STDF 선택 컨트롤의 `type` 없는 button을 `type="button"`으로 바꿔 누를 때·Enter 때 폼이 제출되지 않게 한다. `Checkbox`·`Radio`·`Stepper`가 든 모든 폼에 붙인다 |
| `confirm` | `lib/ui/confirm.ts` | `dialog.confirm` | 확인 창. `Feedback` 내부 상태가 공개되지 않아 `overlay` 대신 호출 단위로 Escape·포커스 복귀 처리 |
| `desktop` | `lib/ui/viewport.svelte.ts` | `MediaQuery('min-width: 1024px')` | 데스크톱·모바일 변형 전환 기준 하나 |
| `setMode` / `currentMode` | `lib/ui/theme.ts` | `stdf/theme`의 `switchMode`·`getMode` | 화면 모드 전환과 저장 |
| `AppHeader` | `lib/components/layout/` | `NavBar` + `ContextNav` + `MenuButton`(서버 선택·계정·내전 범위의 서버 메뉴) + `Button`(화면 모드), 모바일은 `Popup position="right"` | [routing.md 3절](routing.md#3-헤더). 서버 선택·계정 메뉴 항목은 이 파일에서 만든다 |
| `MenuButton` | `lib/components/layout/` | `Button fill="text"` + `ActionMenu` | 헤더의 트리거 버튼과 메뉴 |
| `ActionMenu` | `lib/components/common/` | `ActionPopover` / `ActionSheet` + `overlay` | 같은 항목을 데스크톱은 트리거 아래 inline, 모바일은 하단 시트로 연다. 마운트 후에만 렌더링 |
| `ContextNav` | `lib/components/layout/` | `<nav><a>` | 범위 메뉴 링크. 데스크톱은 가로, 모바일 패널은 세로. 같은 항목 데이터를 쓴다 |
| `AppFooter` | `lib/components/layout/` | 텍스트 + `<a>` | [routing.md 3.3](routing.md#33-푸터) |
| `ScrimSummary` | `lib/components/scrims/` | 어두운 카드(배경 아트) + 제목 `h1` + 상태 점 + 설정 칩, 아래 전체 폭 `Steps`(번호·체크 막대) | 내전 하위 세 페이지 위에 한 번. 어두운 바탕이라 `StatusTag` 대신 흰 글자 + 상태색 점을 쓴다 |
| `LinkCell` | `lib/components/common/` | `<a>` + STDF `Cell`과 같은 클래스, `CellGroup` 안에서 사용 | 이동하는 목록 행. props: `href`, `title`/`titleChild`, `subTitle`, `detail`/`detailChild`(제목 줄 오른쪽), `info`/`infoChild`(부제 줄 오른쪽), `leftChild`, `line`(구분선). grid라 오른쪽 칸은 항상 해당 줄에 맞는다. 내부에 다른 조작을 넣지 않는다 |
| `StatusTag` | `lib/components/common/` | STDF `Tag`를 `inert`로 감싸고 문구는 보조기기용 텍스트로 | 상태 표시. 링크·버튼 안에서도 조작 요소가 중첩되지 않는다 |
| `DateBadge` | `lib/components/common/` | `<span>` 상자 | 목록 행 왼쪽의 `10월 / 31` 날짜 상자. 날짜가 없으면 점선 상자에 `미정`·`미확인` 등 |
| `SwitchCell` | `lib/components/common/` | `<label>` + STDF `Switch`, Cell과 같은 클래스 | 즉시 반영 on/off 행. STDF Cell의 스위치는 button 안에 button이 들어가 HTML이 깨지므로 쓰지 않는다 |
| `ActivityBoard` | `lib/components/guild/` | `Tab` + `ScrimListRow` / `MatchListRow` | 서버 홈 "내전 현황": 진행 중인 내전과 최근 경기를 한 카드의 탭으로 |
| `NextScrimHero` | `lib/components/guild/` | 어두운 카드 + `CountDown` + `Progress` + 링크 버튼 | 서버 홈 맨 위 "내 다음 내전" |
| `StoryCarousel` | `lib/components/guild/` | 가로 스크롤 스냅 + `Button` | 서버 홈 "이번 주 이야기" |
| `RankingBoard` | `lib/components/guild/` | `Tab` + `InfiniteScroll` + `LinkCell` | 서버 홈 포지션별 MMR 순위 |
| `ScrimListRow` | `lib/components/scrims/` | `LinkCell` + `DateBadge` + `StatusTag` | 내전 목록 행(서버 홈·내전 목록). 오른쪽 아래 내 신청 상태 |
| `MatchListRow` | `lib/components/matches/` | `LinkCell` + `DateBadge` + `StatusTag` | 경기 목록 행(서버 홈·경기 기록). 점수는 항상 보이고 팀 이름만 줄어든다. 상태 태그는 종료 외 상태만 |
| `SectionState` | `lib/components/common/` | `Skeleton` / 점선 상자 + 문구 / 점선 상자 + 문구 + `Button` | 영역 하나의 `loading`·`empty`·`error(retry)` 표현. 목록 자리에 같은 폭으로 놓는다. 정상 상태는 렌더링하지 않는다 |
| `ScrimSettingsDialog` | `lib/components/scrims/` | `Popup` + `<form>` (`Input`·`Calendar`·`Stepper`·`Radio`·`SwitchCell`) | 모집 만들기(내전 목록)와 내전 설정 수정(요약 운영 카드)이 같은 폼을 쓴다. `editable`로 단계별 입력 가능 필드를 받는다 |
| `AvatarStack` | `lib/components/common/` | STDF `AvatarGroup` | 겹친 얼굴 묶음 + 정확한 `+N`. 마운트 후 렌더링·`inert`·이미지 키 보정([7절](#7-stdf-300-제약과-대응)). 이미지가 없으면 이름 첫 글자 색 원(`lib/ui/avatar.ts`) |
| `PlayerName` | `lib/components/common/` | `<img>` + 이름 + 선택적 `<a>` | 당시 표시 이름, 공개 허용 시 Riot ID, `userId`가 있으면 `/players/[userId]` 링크 하나 |
| `TeamRoster` | `lib/components/scrims/` | `Card` + 포지션별 행 | 확정된 팀 표시. 수동 편성·경매·경기 상세에서 재사용. 편집 동작은 받지 않는다 |
| `ChampionIcon` | `lib/components/common/` | `<img>` (Data Dragon) | 챔피언 이미지 + 이름 `alt`. 매핑 실패 시 이름 텍스트 |

## 6. 네이티브 HTML을 쓰는 곳

| 경우 | 요소 | 이유 |
| --- | --- | --- |
| 페이지 이동 | `<a href>` (`LinkCell`, `ContextNav`, 본문 링크) | STDF는 링크를 렌더링하지 않는다. 새 탭·주소 복사·프리로드를 위해 이동은 링크로 |
| 다열 수치 데이터 | `<table>` + `<caption>` + `<th scope>` | STDF에 `Table`이 없다. 모바일에서는 핵심 열만 두고 `overflow-x-auto` 컨테이너 |
| 폼 경계 | `<form>`, `<fieldset>`, `<legend>` | Enter 제출과 그룹 라벨. 안의 컨트롤은 STDF |
| 정적 이미지 | `<img>` | `Avatar`는 항상 버튼 |
| 문서 본문 | `h1~h3`, `p`, `ol/ul`, `dl` | 약관·문서·소개 문구 |

이 다섯 경우의 스타일도 토큰과 Tailwind 유틸리티로 쓰고, STDF와 같은 모서리·간격·포커스 표시를 맞춘다.

## 7. STDF 3.0.0 제약과 대응

설치 소스에서 확인한 사실이다. 화면에 쓰기 전 `/dev/components`에서 대응을 검증한다.

| 제약 | 대응 |
| --- | --- |
| `Cell`의 오른쪽 스위치는 행 `<button>` 안에 Switch `<button>`이 들어가 SSR HTML이 깨지고 hydration이 실패한다 | `SwitchCell` |
| `sr-only`는 `position: absolute`라 가까운 positioned 조상이 없으면 `overflow` 스크롤 영역 밖으로 빠져 문서 높이를 늘린다(푸터 아래 빈 공간) | 행·스크롤 영역에 `relative`를 둔다(`LinkCell`, 순위 스크롤 영역) |
| 오버레이에 dialog 역할·포커스 가두기·Escape·스크롤 잠금이 없다. 마스크가 이름 없는 `<button>`이다 | `overlay` attachment. `Popup`이 제자리에 렌더링되므로(포털 없음) 래퍼 `<div>`로 보완한다. 확인 창은 `confirm()` 헬퍼 |
| 어떤 컴포넌트도 `aria-*`·`id`·`class`를 전달받지 않는다 | 접근 가능한 이름이 필요하면 감싸는 요소(`<fieldset>`, 래퍼 `<div role>`)나 보이는 텍스트로 준다. 아이콘 전용 버튼은 `Button` 안에 `<span class="sr-only">` 이름을 넣는다 |
| `Switch`·`Radio`·`Checkbox` 항목이 상태 ARIA 없는 `<button>`이다 | 그룹은 `<fieldset><legend>`. 상태가 문구로 드러나야 하는 곳(공개 설정)은 `Cell`의 `detail`에 현재 값 텍스트를 쓴다 |
| `Tabs`에 `tablist`/`aria-selected`가 없다 | 탭 묶음을 `<div role="group" aria-label>`로 감싸고, 선택된 내용 영역 제목에 현재 선택을 쓴다 |
| `Button size="md" \| "sm"`은 정의된 CSS가 없어 패딩이 사라진다 | `size`는 `full`·`big`·`auto`만. 작은 버튼은 `size="auto"` + `heightIn`/`heightOut` |
| `Button disabledLoading` 기본값이 `true` | `loading` 중에는 자동 비활성. 의도된 동작이므로 그대로 쓴다 |
| `Input type`은 `password` 외에 모두 `type="text"`로 렌더링 | 이메일·숫자 형식 검증은 직접. 숫자 값은 문자열로 받는다 |
| `ImageList` 기본 모서리가 정의 안 된 `--radius-btn`을 쓴다 | `radius`를 명시한다. 이미지 썸네일 대신 `itemChild`로 파일 정보를 그린다 |
| `List`는 `onclickItem` 없으면 행이 disabled 버튼 | 보기 전용 목록은 `CellGroup` 또는 `<ul>` |
| `Toast`·`Progress`·`Loading`·`Skeleton`에 live region이 없다 | 루트에 `role="status"` 영역 하나를 두고 중요한 결과 문구를 같이 넣는다 |
| `Tag`가 동작이 없어도 항상 `role="button" tabindex="0"`이다(끄려면 `disabled` → 흐린 모양). 링크·Cell 안에 두면 조작 요소가 중첩되고 Tab이 멈춘다 | `StatusTag`로만 쓴다 |
| 상태색(`success` 등)이 밝은 바탕 기준이라 다크 모드에서 `Tag` 글자가 묻힌다 | `layout.css`의 다크 모드 블록에서 상태색을 한 단계 밝게 덮어쓴다. 상태색 바탕에 흰 글자를 쓰는 `fill="base"`는 다크 모드 대비를 확인한 뒤 쓴다 |
| `AvatarGroup`은 루트 `<button>` 안에 Avatar `<button>`을 넣어 SSR HTML이 깨진다. `{#each}` 키가 `image`라 이미지가 없거나 같으면 키 중복 오류가 난다. `top="totle"`의 `+N`은 남은 수가 아니라 전체 수다 | `AvatarStack`으로만 쓴다: 마운트 후 렌더링(같은 크기 자리 확보), `inert`+`aria-hidden`, 이미지 URL에 `#키` 또는 이니셜 data URL, `top` 스니펫으로 남은 수 표시. 루트가 `w-full`이라 감싸는 요소에 너비를 준다 |
| `Avatar`는 항상 이름 없는 `<button>`이고 `alt`는 대체 텍스트가 아니라 이미지가 없을 때 보이는 글자다 | `Avatar`를 쓰지 않는다 |
| `ActionPopover`가 초기화 중 `document`를 읽어 SSR이 500으로 실패한다. trigger 없이는 아무것도 그리지 않는다(ring·inline 모드뿐) | `onMount` 이후에만 렌더링하고 모바일은 `ActionSheet` (`ActionMenu`) |
| 한국어 `Input` 기본 placeholder가 "비밀번호를 입력해주세요"다 | `Input`마다 `placeholder`를 명시한다 |
| `Popup position="center"`의 패널이 화면 전체 너비다. `px`·`py`는 안쪽 여백이 아니라 화면 가장자리와의 간격이다 | 입력 팝업은 `transparent`로 두고 내용 요소에 `max-w-lg`·배경·모서리를 준다. 안쪽 여백은 내용 요소의 `p-*` |
| `Steps`의 `current`는 1부터 센다(0은 시작 전, 단계 수+1은 모두 완료) | `ScrimSummary`의 대응표 참고 |
| `Steps` 기본 막대는 완료·예정 단계가 같은 빈 점이고, 목록 구조·현재 단계를 보조기기에 알리지 않는다 | 단계마다 `bar`(번호)·`finishStep.bar`(`✓`)를 주고, 화면용은 `aria-hidden` + `sr-only` `<ol>`에 `aria-current="step"` |
| `ImageList` 등 일부 컴포넌트의 기본 아이콘이 `/fonts/symbol.svg` 스프라이트를 요청한다(없으면 404) | 스프라이트를 두기 전까지 `uploadChild` 같은 스니펫으로 아이콘을 대체 |
| `Button size="auto"`는 가로 여백이 없다 | `injClass="px-2"`~`px-4`를 함께 준다 |
| `NavBar` 루트가 `h-12 bg-white dark:bg-black`를 고정으로 가진다 | `injClass`에 `h-(--app-header-height)! bg-transparent!`처럼 `!` 수정자로 덮는다 |
| 기본 언어가 중국어 | 루트 `ConfigProvider` 필수 |
| `Checkbox`·`Radio`·`Stepper`의 항목이 `type` 없는 `<button>`이라 `<form>` 안에서 누르면 제출된다. Enter 암묵 제출도 첫 항목 버튼을 눌러 값을 바꾼다 | 폼에 `{@attach nonSubmitButtons}`. 제출 버튼은 `Button type="submit"` 명시 |
| `Button fill="text"`는 `state`를 무시하고 항상 본문색이다 | 색이 있는 텍스트 버튼(철회 등)은 `fill="textState" state="error"` |
| `Tab`의 `showNum`은 개수 배지가 아니라 한 번에 보이는 탭 칸 수(기본 3)다. `overflow` 모드는 ResizeObserver 루프 오류를 낸다 | 칸 수만큼 `showNum`을 주고 `overflow`는 쓰지 않는다. 좁은 화면에 다 안 들어가면 라벨을 줄인다 |
| `List` 일괄 선택 모드는 선택 칸(40px)만큼 행을 오른쪽으로 밀어 오른쪽 끝 내용이 잘린다. `itemPx`의 `px-0`이 `itemInjClass` 여백을 덮는다 | `itemInjClass="pl-3! pr-13!"` |
| `List batchSelectable`은 보기 모드에서도 자체 `편집` 토글을 그린다 | 보기 목록은 `<ul>`로 따로 두고, 관리 버튼을 누를 때만 `batchMode`로 `List`를 렌더링한다. `List`의 `완료`가 `batchMode`를 끄면 보기 목록으로 돌아간다 |
