# 화면 패턴

작성일: 2026-10-30. 모든 페이지에 공통인 상태·폼·오버레이·목록·반응형 규칙. 컴포넌트 선택 근거는 [design-system.md](design-system.md).

## 0. 페이지 골격

```text
[제목 h1]                                   [주 작업 Button]   ← 주 작업이 있을 때만, 페이지당 하나
[필터 Tabs] [검색 Input]                                        ← 목록 페이지
─────────────────────────────────────────────────────────────
[영역 h2]                                   [영역 작업]
  내용
[영역 h2]
  내용
```

- `h1`은 페이지당 하나. `<svelte:head><title>{제목} | {SERVICE_NAME}</title>`과 같은 문구.
- 내전 하위 페이지는 `ScrimSummary`가 `h1`을 가진다. 그 아래 페이지 본문은 `h2`부터 시작.
- 주 작업 버튼: `Button fill="base" size="auto"`. 보조 작업: `fill="lineLight"`. 위험 작업: `state="error"`.
- 같은 작업 버튼을 위·아래, 헤더·본문, 빈 상태에 반복하지 않는다.
- 설명 문구는 꼭 필요한 곳에 한 번. 제목을 바꿔 말한 부제를 달지 않는다.

## 1. 상태 표현

각 영역은 아래 상태 중 필요한 것을 가진다. 페이지 전체를 볼 수 없는 경우(404·403·5xx)는 `load`에서 `error()`를 던져 공통 오류 화면으로 보낸다.

| 상태 | 표현 | 금지 |
| --- | --- | --- |
| 최초 로딩 | 데이터 모양의 `Skeleton` (`SectionState state="loading"`). SvelteKit `load`가 SSR로 주므로 주로 클라이언트 재조회·스트리밍 영역에서만 발생 | 빈 상태 문구와 동시 표시 |
| 조건 변경 중 | 이전 결과를 `opacity-50`으로 두고 영역 제목 옆 작은 `Loading` | 이전 결과를 새 조건 결과처럼 보이게 두기 |
| 데이터 없음 | 목록 자리에 점선 상자 + 한 줄 문구 (`SectionState state="empty"`). "아직 내전이 없어요" / "조건에 맞는 내전이 없어요"를 구분 | 빈 상태 안에 생성 버튼 반복(이미 페이지 상단에 있음) |
| 영역 조회 실패 | 점선 상자 + 문구 + `다시 시도` (`SectionState state="error"`). 나머지 영역은 정상 표시. `load`에서 영역별로 `Promise.allSettled` → `SectionResult`로 넘기고, 다시 시도는 `depends` 키를 `invalidate` | 오류를 toast로만 알림, 한 영역 실패로 페이지 전체 오류 |
| 권한 없음 | 해당 조작을 렌더링하지 않는다 | 비활성 버튼으로 노출 |
| 조건 미충족 (권한은 있음) | 버튼을 `disabled`로 두고 바로 아래 한 줄로 이유 ("선발 인원이 10명이어야 해요 (현재 8명)") | 이유 없는 비활성 |
| 제출 중 | 해당 `Button`의 `loading` (자동 비활성). 폼 입력은 그대로 둔다 | `loading.show()` 전체 차단, 측정하지 않은 퍼센트 |
| 성공 — 결과가 화면에 보임 | 화면 갱신만. 별도 알림 없음 (예: 목록에 새 항목, 태그 변경) | 같은 사실을 toast·문구로 반복 |
| 성공 — 결과가 안 보임 | `toast.success('저장했어요')` (예: 공개 설정 저장, 팝업 닫힘 후) | |
| 폼 검증 실패 | 해당 `Input`의 `state="error"` + `tip`, 첫 오류 입력에 포커스 | 폼 위 요약 박스와 필드 오류 중복 |
| 비폼 작업 실패 (토글, 일괄 작업) | 값 원복 + `toast.error(이유)` | |
| 동시 수정 충돌 | 서버가 409를 주면 `toast.error('다른 사람이 먼저 변경했어요')` + `invalidateAll()`로 최신값 표시. 폼 입력값은 유지 | 자동 재전송·덮어쓰기 |
| 응답 불확실 (네트워크 끊김) | 저장 여부를 단정하지 않고 `invalidateAll()`로 현재 상태 확인 후 다시 시도 가능 | 무조건 재전송 |

에러 문구 규칙: 사용자가 할 수 있는 일을 쓴다. 상태 코드·예외 이름·내부 용어를 쓰지 않는다. 존댓말 `~해요`체.

## 2. 데이터 흐름

- 읽기: `+page.server.ts`의 `load`가 페이지에 필요한 값을 화면용 형태로 만든다. 컴포넌트는 props만 받고 API·목 데이터를 직접 가져오지 않는다.
- 쓰기: **SvelteKit form action**으로 통일한다(remote function은 Kit 3.1에서 아직 실험 기능). 입력 폼은 `<form method="POST" action="?/이름" use:enhance>`, 폼이 없는 조작(토글·메뉴 항목)은 `lib/ui/actions.ts`의 `postAction(이름, 값)`을 쓴다. STDF 입력에는 `name`이 없으므로 `enhance` 콜백에서 `formData.set`으로 값을 넣는다. 예시는 `/me`.
- 목 데이터: `lib/mocks/<기능>.ts`. `load`가 개발 모드에서 목을 반환하도록 하고, 컴포넌트는 목을 모른다.
- 권한: `load`가 `can: { createScrim: boolean, ... }` 같은 작업 가능 여부를 함께 넘긴다. 화면은 이 값으로 조작을 렌더링할지 정하고, 서버는 쓰기 요청마다 다시 검사한다.

## 3. 폼

```svelte
<form onsubmit={submit} novalidate>
	<Input title="제목" titlePosition="out" bind:value={title}
		state={errors.title ? 'error' : 'theme'} tip={errors.title} required />
	<fieldset>
		<legend>편성 방식</legend>
		<Radio data={methods} bind:value={method} layout="h" />
	</fieldset>
	<Button type="submit" loading={pending}>만들기</Button>
</form>
```

| 규칙 | 내용 |
| --- | --- |
| 라벨 | `Input`은 `title` + `titlePosition="out"`. 그룹 컨트롤은 `<legend>` |
| 필수 | `required`(별표 표시)만으로 검증하지 않는다. 제출 시 직접 검사 |
| 오류 | 필드별 `state="error"` + `tip`. 서버 오류도 해당 필드에 매핑, 필드가 없는 오류는 제출 버튼 위 한 줄 |
| 포커스 | 검증 실패 시 첫 오류 필드로 |
| 제출 | `Button type="submit"`. Enter 제출 시 한글 조합 중(`isComposing`)이면 무시 |
| 버튼 배치 | 팝업 하단 오른쪽 `[취소(lineLight)] [제출(base)]`, 모바일은 `size="full"` 세로 쌓기. 일반 페이지 폼은 제출만 |
| 중복 제출 | `loading` 동안 비활성(STDF 기본). 서버는 멱등 키 또는 상태 검사로 중복 생성 방지 |

## 4. 오버레이

| 종류 | 사용 | 닫기 |
| --- | --- | --- |
| 입력 팝업 | `Popup` + `<form>`. 제목 `h2` → 입력 → 하단 버튼 | `취소` 버튼 · Escape · (입력 없을 때만) 마스크. 입력이 있으면 `confirm('작성 중인 내용이 사라져요')` |
| 메뉴 | `ActionPopover` | 항목 선택 · Escape · 마스크 |
| 확인 | `confirm()` (`lib/ui/confirm.ts`) | 버튼 · Escape |
| 상세 보기 | `Popup`(모바일 bottom, 데스크톱 right) | 닫기 버튼 · Escape · 마스크 |

- 모든 오버레이는 `overlay` attachment 래퍼 안에 둔다. 동시에 하나만 연다(팝업 안에서 `confirm()`은 예외).
- 입력 팝업: `Popup size={0} transparent`(데스크톱 `center`, 모바일 `bottom`). 배경·모서리·`max-w-lg`·`p-6`은 안쪽 `<form>`에 준다. 내용이 길면 최대 높이 90dvh 안에서 스크롤하고 하단 버튼은 스크롤 밖에 둔다. 예시는 `/dev/components`.
- 성공 후 닫히면 포커스는 여는 버튼으로. 여는 버튼이 사라졌으면 페이지 `h1`으로.
- 팝업 위치 전환은 `svelte/reactivity`의 `MediaQuery('min-width: 1024px')` 하나로 한다.

## 5. 목록과 표

| 유형 | 구성 |
| --- | --- |
| 이동하는 목록 (내전, 경기, 사용자 출전 기록) | STDF `CellGroup` 안 `<ul>`에 `LinkCell` 기반 행(`ScrimListRow`·`MatchListRow`). 한 행에 링크 하나. 상태는 `StatusTag`. 나란히 놓이는 목록은 행 높이를 맞춘다 |
| 작업하는 목록 (참가자 선발, 멤버 권한) | `List batchSelectable` 또는 `CellGroup`+`Cell`(→ `ActionPopover` 행 메뉴) |
| 수치 비교 (게임 결과, 통계 순위) | `<table>`. 숫자는 `tabular-nums text-right`. 모바일은 핵심 3~4열, 나머지는 행 상세 팝업 |
| 필터 | 목록 위 `Tabs`. 선택은 URL 쿼리 |
| 검색 | `Input type="search"`. Enter 제출, 쿼리 `q` |
| 페이지 | 목록 아래 `Pagination`, 페이지당 20. 결과가 한 페이지면 렌더링하지 않는다 |

- 목록에 이미 있는 정보(제목, 상태)를 상세 영역에 다시 요약 카드로 만들지 않는다.
- 같은 대상(같은 내전)으로 가는 링크는 화면에 하나만. 서버 홈에서 한 내전이 "진행 중"과 "최근"에 둘 다 해당하면 한쪽에만 둔다.

## 6. 반응형

- 모바일 우선으로 작성하고 `lg:`에서 넓힌다. 확인 폭: 360 · 768 · 1024 · 1440px.
- 같은 DOM을 재배치하는 것이 기본(`flex-col lg:flex-row`, `grid lg:grid-cols-[2fr_1fr]`).
- 데스크톱·모바일 변형이 다른 컴포넌트여야 하면(헤더 메뉴, 팝업 위치) `lib/ui/viewport.svelte.ts`의 `desktop.current`로 **하나만 렌더링**한다. CSS `hidden`으로 두 벌을 동시에 두지 않는다. `desktop.current`는 루트 레이아웃 마운트 전에는 항상 `false`라 서버 HTML과 hydration이 어긋나지 않는다(MediaQuery를 직접 쓰지 않는다).
- SSR 첫 렌더는 모바일 기준이다. 데스크톱 변형은 hydrate 후 바뀌어도 레이아웃이 크게 흔들리지 않게 헤더 높이를 고정한다.
- 가로 스크롤은 표 컨테이너에서만. 드래그만으로 할 수 있는 조작을 만들지 않는다.

## 7. 접근성

- 본문 바로가기 링크(이미 있음), 페이지마다 `h1` 하나, 영역마다 `h2`.
- 포커스 표시: 전역 `:focus-visible { outline: 2px solid currentColor; outline-offset: 2px }`를 `layout.css`에 한 번. 컴포넌트별로 다시 쓰지 않는다.
- 터치 대상 높이 최소 44px(`Button heightIn`, 행 `py-3`).
- 상태는 색 + 문구(`Tag text`). 승패는 "승"/"패" 글자.
- 키보드만으로 모든 작업 완료. 특히 편성 배정은 드래그 없이 팝업으로.
- `prefers-reduced-motion`이면 STDF `transition`/`duration` prop을 0 또는 null로.

## 8. 완료 체크리스트

UI 작업을 끝내기 전에 렌더링된 화면에서 확인한다.

- [ ] 헤더·본문·푸터·열린 메뉴·팝업을 합쳐 같은 작업 조작이 하나뿐이다.
- [ ] 같은 설명이 제목·부제·카드·안내 문구에 반복되지 않는다.
- [ ] 데스크톱·모바일 변형이 동시에 렌더링되지 않는다.
- [ ] 정상·로딩·빈 데이터·오류·비활성 중 해당 상태를 모두 확인했다 (`/dev/components` 또는 목 `preview`).
- [ ] 360px과 1440px, 라이트·다크, 키보드만, 긴 한국어 이름에서 깨지지 않는다.
- [ ] STDF로 가능한 UI를 수제로 만들지 않았다. 네이티브 HTML은 [design-system.md 6절](design-system.md#6-네이티브-html을-쓰는-곳)의 경우뿐이다.
- [ ] `pnpm check` (`check:branding` 포함) 통과.
