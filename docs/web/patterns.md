# 화면 패턴

갱신일: 2026-11-03. 현재 코드의 공통 패턴과 확인이 필요한 한계를 기록한다. 선택 기준과 STDF 제약은 [design-system.md](design-system.md), 경로·쿼리는 [routing.md](routing.md)를 따른다. 아래 완료 체크리스트는 작업 기준이며 현재 모든 화면이 이를 충족한다는 뜻은 아니다.

## 0. 페이지 골격

- 루트 레이아웃이 헤더·본문·푸터를 한 번 조립한다. 페이지는 화면 조립, 기능 컴포넌트는 표현과 상호작용, 서버 `load`는 초기 데이터 준비를 맡는다.
- 일반 페이지는 본문의 `h1`과 `SERVICE_NAME`을 포함한 문서 제목을 사용한다. 내전 하위 페이지는 레이아웃의 `ScrimSummary`가 `h1`을 담당하고 본문은 `h2`부터 시작한다.
- 주 작업이 있을 때만 상단 또는 해당 작업 영역에 버튼을 둔다. 같은 대상·동작을 헤더·본문·빈 상태에 반복하지 않는다.
- 기본 작업은 STDF `Button`, 보조 작업은 `fill="lineLight"` 또는 `fill="text"`, 위험한 텍스트 작업은 `fill="textState" state="error"`를 쓴다.
- 일반 목록·조회 페이지와 편성·경매·대진 작업판의 배치는 다르다. 모든 페이지를 같은 제목·카드·탭 골격으로 강제하지 않는다.

## 1. 상태 표현

| 상태 | 현재 공통 수단·사용처 |
| --- | --- |
| 페이지 조회 불가 | `load`의 `error()`와 루트 `+error.svelte`. 권한·개발 모드·대상 존재 여부에 따라 401·403·404 등 발생 |
| 최초 대기 | `SectionState state="loading"`: `aria-busy`·숨긴 로딩 문구·STDF `Skeleton`. 백오피스는 서버 상태 Promise를 스트리밍하고 `{#await}`로 대기 표시 |
| 조건 변경 중 | 내전 목록은 `$app/state`의 `navigating`으로 이전 결과 흐림·작은 `Loading`을 표시. 모든 목록의 공통 자동 동작은 아님 |
| 데이터 없음 | `SectionState state="empty"` 또는 해당 목록의 간단한 문구. 빈 결과 안에 상단 생성 작업을 다시 두지 않음 |
| 영역 조회 실패 | `SectionState state="error"`: `role="alert"`, 오류 문구, 재시도 중 비활성인 버튼. 서버 홈은 `Promise.allSettled`·`SectionResult`로 영역별 실패를 분리 |
| 권한 없음 | `can`, `guild.isAdmin` 등으로 관리 조작 렌더링을 제한. 일부 action은 목 권한을 다시 검사하지만 서버 관리의 Riot 계정 action은 실행자 권한 검사가 없음. 실제 인증·권한 정책은 미연결 |
| 조건 미충족 | 편성 인원·잔여 포인트·단계 등 해당 기능의 조건에 따라 `disabled`와 이유 문구 사용 |
| 제출 중 | `Button loading={pending ? {} : null}`. STDF `disabledLoading=true`로 해당 버튼 비활성. 입력 잠금·취소 허용 여부는 폼별 구현 |
| 성공 | 결과가 화면에 보이면 데이터 갱신으로 알림. 설정 변경 등 일부 작업은 `toast.success` 사용 |
| 폼 실패 | 필드 오류는 `Input state="error"`·`tip`, 비필드 오류는 폼 안 `role="alert"` 문구. 그룹 선택 오류는 그룹 바로 아래 표시 |
| 비폼 작업 실패 | `postAction`이 오류 문자열을 반환하고 호출 컴포넌트가 `toast.error` 또는 인라인 문구로 표시 |

서버 홈의 재시도는 `invalidate('app:guild-home')`, 백오피스는 `invalidate('app:service-status')`, 경매 갱신은 `invalidate('app:auction')`를 사용한다. 서버 홈의 업적 조회 실패는 영역 생략, 다음 내전 조회 실패는 `NextScrimHero`의 빈 안내로 처리하므로 모든 영역이 같은 오류 상자를 갖지는 않는다.

문구는 사용자가 이해할 수 있는 한국어로 쓰고 필요한 피드백을 한 곳에서 제공한다. 공통 오류 화면의 HTTP 상태 표시는 현재 구현이며, 업무 폼에 내부 예외를 그대로 표시하는 근거로 사용하지 않는다.

## 2. 데이터 흐름

### 2.1 읽기와 갱신

- 초기 읽기는 주로 `+page.server.ts`·`+layout.server.ts`의 `load`가 담당한다. 화면용 타입은 `lib/features/`, 목 데이터·목 변경 함수는 `lib/mocks/`에 있다.
- 개발 모드에서 루트가 목 사용자·서버를 내려주고, 대부분의 업무 화면은 목 데이터를 조회·변경한다. 운영 모드 업무 화면은 아직 열리지 않는다.
- 실제 서버 조회도 일부 있다. Data Dragon 이미지·챔피언/장비 정보와 백오피스의 서비스 상태는 각 서버 모듈을 사용한다. 서버 홈 순위는 전용 GET 경로가 있지만 순위 데이터 자체는 목이다. 기능별 데이터 출처는 페이지 문서에 기록한다.
- 컴포넌트는 목 모듈을 직접 읽지 않는다. 다만 `RankingBoard`는 초기 순위 props에서 시작해 무한 스크롤 시 전용 `/ranking` GET 경로를 직접 조회하고, 기능 컴포넌트는 필요한 form action을 호출한다. 모든 통신이 `load`에만 있는 구조는 아니다.
- URL에 저장한 필터·검색·쪽 상태는 `goto(url, { reset: false })` → `load`로 갱신한다. 서버 홈 탭·통계 정렬 등 로컬 상태는 URL에 저장하지 않는다.

### 2.2 쓰기

현재 업무 변경은 SvelteKit form action을 사용한다.

| 형태 | 구현 |
| --- | --- |
| 입력 폼 | `<form method="POST" action="?/이름" use:enhance={submit}>`. STDF 값은 콜백에서 `formData.set` 또는 기능별 직렬화 helper로 추가 |
| 폼 없는 작업 | `lib/ui/actions.ts`의 `postAction(name, fields)`가 현재 페이지에 POST하고 `deserialize`로 결과 해석 |
| ROFL 업로드 | `RoflUploadDialog`가 파일마다 `?/upload`에 `FormData`를 순차 전송하고 상태·마지막 기록 순서를 보관 |

`postAction`은 성공 시 `invalidateAll()` 후 `null`, `failure`의 `data.message`가 있으면 그 문자열, 그 외는 일반 실패 문구를 반환한다. 네트워크 예외는 현재 상태를 `invalidateAll()`로 다시 요청한 뒤 확인 문구를 반환한다. redirect·페이지 오류를 `applyAction`으로 처리하는 일반 helper는 아니다.

409 충돌 최신화도 일괄 동작이 아니다. `RegistrationDialog`는 409 때 `invalidateAll()`로 정원을 갱신하지만, `postAction`은 상태 코드별 최신화·자동 재전송을 하지 않는다. 모든 쓰기에 멱등 키가 구현된 것은 아니며 각 action의 상태 검사와 제약을 확인해야 한다.

## 3. 폼

| 항목 | 현재 패턴 |
| --- | --- |
| 입력 표시 | STDF `Input`의 `title`, `titlePosition="out"`, 명시적 `placeholder`; 그룹은 `<fieldset><legend>` |
| 검증 | `novalidate` 폼에서 클라이언트와 서버가 필요한 형식·범위를 검사. `required` 표시만으로 검증하지 않음 |
| 값 전달 | STDF 입력에 HTML `name`이 없으므로 `enhance`에서 `FormData` 구성 |
| 선택 컨트롤 | `Checkbox`·`Radio`·`Stepper`가 있는 폼에 `nonSubmitButtons` attachment. 타입 없는 내부 버튼을 `type="button"`으로 보정하고 이후 DOM 변경도 관찰 |
| 제출 | 제출용 `Button`에 `type="submit"`. `loading`으로 중복 클릭을 막음 |
| 오류 포커스 | `ScrimSettingsDialog`가 `data-field` 래퍼의 실제 입력을 찾아 첫 제목·날짜·시각 오류로 이동. 다른 폼의 공통 자동 기능은 아님 |
| 버튼 배치 | 모집 설정·참가 신청은 모바일 전체 폭 세로, 데스크톱 오른쪽 가로. 멤버 계정 관리·ROFL은 각 팝업의 가로 작업 줄 사용 |

실제 폼별 차이:

- `ScrimSettingsDialog`: 모집 생성·수정 공용. 열 때 `initial`에서 값·오류를 초기화한다. `editable`로 단계별 필드를 표시하고 변경된 값이 있을 때 취소·Escape에 폐기 확인을 요청한다. 달력은 `popup={null}`로 폼 안에 펼친다.
- `RegistrationDialog`: 계정 선택·희망 포지션 입력. 포지션 미선택 오류는 그룹 아래에 표시하고 취소 시 폐기 확인은 없다. 제출 중에는 닫지 않는다.
- `MemberRiotAccountsDialog`: 조회 → 연결 확인 두 단계의 form action. 해제·대표 변경은 `postAction`이다. 입력 오류를 표시하지만 첫 오류 포커스 이동은 별도로 구현하지 않았다.
- `RoflUploadDialog`: 네이티브 숨긴 파일 입력과 STDF `ImageList`를 연결하고, 파일별 POST를 직접 수행한다. 일반 `<form use:enhance>` 형태는 아니다.

STDF `Input`의 `title`은 설치 버전에서 네이티브 `<label>` 연결을 만들지 않으며 임의 `id`·`aria-*` 전달도 제공하지 않는다. 현재 보이는 라벨만으로 프로그램적 입력 이름이 모두 보장되는 것은 아니다. 또한 STDF는 입력값의 조합 이벤트를 처리하지만 프로젝트 폼에는 제출 시 `isComposing`을 검사하는 공통 코드가 없다.

## 4. 오버레이

| 종류 | 현재 구현 |
| --- | --- |
| 입력 팝업 | `Popup` + 내용 상자 또는 폼. `desktop.current`에 따라 데스크톱 `center`, 모바일 `bottom` |
| 헤더·행 메뉴 | `ActionMenu`: 마운트 후 데스크톱 `ActionPopover`, 모바일 `ActionSheet` |
| 상세 보기 | `GamePlayerDialog`는 데스크톱 `right`, 모바일 `bottom`. 후보·업적 목록은 각 팝업 구성 사용 |
| 확인 | `confirm(content, title?)`가 STDF `dialog.confirm`을 호출하고 `Promise<boolean>` 반환 |

`Popup`·`ActionMenu`를 감싸는 `overlay({ open, label, onclose })` attachment의 실제 책임은 다음과 같다.

1. 열린 래퍼에 `role="dialog"`, `aria-modal`, `aria-label` 부여.
2. 래퍼에서 `body`까지 올라가며 형제 요소를 `inert`로 만들고 `body` 스크롤 잠금.
3. 다음 프레임부터 `[data-autofocus]` 또는 첫 조작 가능한 요소로 포커스 이동을 재시도하고 직접 자식 마스크 버튼을 탭·보조기기에서 제외.
4. Escape를 `onclose`로 전달. 닫힐 때 속성·`inert`·스크롤을 복원하고 이전 포커스 요소가 남아 있으면 복귀.

이 helper에는 Tab 순환 처리, 사라진 트리거 대신 `h1`으로 이동하는 기능, 전역 오버레이 관리자 기능이 없다. `confirm`도 Escape와 기존 포커스 복귀만 추가하며 `overlay`와 같은 배경 차단·초기 포커스를 제공하지 않는다. 팝업 안 확인창은 호출 코드가 존재하지만 배경 `inert`와의 충돌·키보드 접근은 별도 검증 대상이다.

모집 설정·참가 신청·멤버 계정 팝업은 `maskClosable={false}`다. ROFL 팝업은 업로드 중에만 마스크 닫기를 막는다. 마스크가 `visible`만 바꿀 때 사용자 정의 `close()`의 초기화·갱신 콜백까지 실행되는지 따로 확인해야 한다. 현재 ROFL 팝업은 마스크 닫기와 `close()`가 연결되어 있지 않다.

긴 모집 설정·ROFL·선수 상세 팝업은 내부 스크롤과 별도 머리/작업 줄을 둔다. 모든 팝업이 동일한 최대 높이·너비·푸터를 사용하는 것은 아니다.

## 5. 목록과 표

| 유형 | 현재 구성 |
| --- | --- |
| 내전 목록·서버 홈 현황 | `CellGroup` 안 `<ul>` + `ScrimListRow`·`MatchListRow` (`LinkCell`) |
| 경기 기록 | `MatchTable`의 `<section>`·`<ul>`·행 전체 `<a>`. 이름과 달리 네이티브 table 아님 |
| 참가자 관리 | 평소 보기 목록, 관리 모드에서 `List batchSelectable`·일괄 작업 |
| 서버 멤버·Discord 설정 | 멤버 행은 관리자 `StatusTag`와 Riot 계정 관리 버튼. 관리자 여부는 표시 전용이며, 운영자 역할·채널 선택은 `DiscordSettingRow`·`ActionMenu` |
| 수치 비교 | 게임 진영 표·사용자 기록·리더보드의 네이티브 `<table>`. 모바일에서 일부 열 생략 또는 컨테이너 가로 스크롤 |
| 필터 | STDF `Tab`. 목록 필터는 URL, 참가자 필터·서버 홈 탭은 로컬 상태 |
| 검색 | `Input` + 제출 폼. 경기 기록·서버 관리의 검색어를 `q`에 반영 |
| 쪽 번호 | `PageNav`: `total`, `pageSize`, `current`, `onchange`, 선택적 `label`. 한 쪽이면 미렌더링. 페이지 크기는 호출자가 전달 |
| 추가 조회 | `RankingBoard`의 카드 내부 스크롤 + `InfiniteScroll`. 로딩·실패·끝 상태를 컴포넌트가 관리 |

`LinkCell`은 행 전체가 링크이므로 안에 다른 조작을 넣지 않는다. `StatusTag`는 장식 Tag를 `inert aria-hidden`으로 감싸고 상태 문구를 숨긴 텍스트로 별도 제공한다.

서버 홈은 다음 내전 카드가 가리키는 내전을 현황 목록에서 제외한다. 순위는 이미 목록에 표시된 내 순위를 고정 행에서 다시 제공하지 않는다. 같은 대상·동작을 한 화면에 중복하지 않는 원칙은 모든 페이지에서 계속 검토한다.

## 6. 반응형

- 모바일 우선 배치에 `sm`·`md`·`lg`·`xl`을 필요한 범위에서 사용한다. `lg`(1024px)는 JavaScript에서 컴포넌트 변형을 선택하는 공통 기준이다. `md`도 본문 여백·카드 배치 등에 사용하므로 표 열 전용 기준이 아니다.
- 헤더·팝업 위치·얼굴 묶음 등 구조가 바뀌는 곳은 `lib/ui/viewport.svelte.ts`의 `desktop.current`를 쓴다. 루트 마운트 전에는 항상 `false`라 SSR과 hydration 구조가 일치한다.
- 같은 조작의 모바일·데스크톱 변형은 동시에 사용자에게 노출하지 않는다. 같은 DOM을 CSS로 재배치할 수 있으면 그 방식을 쓴다.
- 본문·푸터는 `app-frame`을 공유한다. 768px 미만에서 화면 폭에서 0.5rem, 그 이상에서는 3rem을 뺀 폭을 사용하며 최대 본문 폭은 84rem이다.
- 표뿐 아니라 수동 편성 작업판에도 내부 가로 스크롤이 있다. 경매는 `xl`에서 고정 높이와 영역별 스크롤을, 대진은 좁은 화면에서 세로 배치를 사용한다.
- 확인 폭은 360·768·1024·1440px. 실제 표시되는 조작·오버레이 상태를 함께 확인한다.

## 7. 접근성

현재 공통 보완은 본문 바로가기, `main` 포커스 대상, 전역 `:focus-visible`, `ContextNav`의 현재 링크, `PageNav`의 한국어 이전·다음 이름과 현재 쪽, `SwitchCell`의 제목·켜짐/꺼짐 이름, 장식 이미지의 빈 `alt`, 상태의 문구 표시다.

`SectionState`는 오류를 `role="alert"`로 제공한다. ROFL 파일 결과와 모집 정원은 해당 컴포넌트의 `aria-live`를 사용한다. 루트의 공통 `role="status"` 영역은 없다. STDF `Tab` 그룹 라벨은 있으나 네이티브 tablist 키보드 패턴을 구현한 것은 아니다.

접근성의 남은 확인 항목은 입력의 프로그램적 이름·오류 연결, 오버레이 포커스 순환·중첩 확인창, 모든 컨트롤의 실제 터치 크기, 조합 중 Enter 제출이다. `heightIn="2"`는 여백 옵션이므로 항상 40px 또는 44px 높이를 보장하지 않는다. 푸터 링크는 현재 `min-h-9`다.

움직임 줄이기는 `AuctionTeamCard`의 CSS와 `NextScrimHero`의 LIVE 점 등 일부 효과에서 처리하며, 앱 전체의 STDF 애니메이션·캐러셀에 대한 공통 설정은 없다. 이를 구현 완료로 전제하지 않는다.

## 8. 완료 체크리스트

UI 변경 시 렌더링된 화면으로 확인한다. 이번 문서 정리 자체가 아래 검증의 완료 기록은 아니다.

- [ ] 헤더·본문·푸터·메뉴·팝업을 합쳐 같은 대상의 같은 조작이 한 곳뿐이다.
- [ ] 설명이 제목·부제·카드·안내·툴팁에 반복되지 않는다.
- [ ] 모바일·데스크톱 변형이 동시에 보이거나 조작되지 않는다.
- [ ] 기능에 필요한 정상·대기·빈 데이터·오류·비활성 상태를 확인했다.
- [ ] 360·768·1024·1440px, 라이트·다크, 긴 한국어 이름을 확인했다.
- [ ] 키보드 이동·입력 이름·오류 안내·팝업 열기/닫기·포커스 복귀를 확인했다.
- [ ] STDF 공개 API로 가능한 UI를 재구현하지 않았고, 필요한 네이티브 UI는 [디자인 시스템](design-system.md#6-네이티브-html을-쓰는-곳)에 맞는다.
- [ ] 화면·메타데이터의 서비스 이름은 `SERVICE_NAME`, 워드마크는 `font-brand`를 사용한다.
- [ ] `pnpm check`(`check:branding` 포함)를 통과했다.
