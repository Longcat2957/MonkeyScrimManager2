# 컴포넌트

> **2026-10-29 개정.** 상태 라벨은 `StatusState`(`.state`)로 통일했고 `NowLine` · `ScrimContextBar` · `MetricList` · `FillMeter` · `DataTable`은 제거했다(패널·행·지표·표 규칙으로 흡수). STDF `Steps`(내전 흐름), `ActionSheet`(참가자·멤버 처리), `Accordion`(하드 피어리스 이력)을 도입했다. 세부 스펙은 `system.md`와 구현 코드가 우선한다.

# 컴포넌트 카탈로그

작성일: 2026-10-29. 선행: [디자인 시스템](system.md) · [코드 구조](architecture.md) · 다음: [페이지](pages.md)

이 문서는 새 프론트엔드가 만드는 **모든 서비스 컴포넌트**의 책임·props·상태·STDF 대응·코드 골격을 확정한다.
여기에 없는 컴포넌트를 페이지에서 즉석으로 만들지 않는다. 새 컴포넌트가 필요하면 이 표에 먼저 등록한다.

## 1. 원칙

1. **STDF가 있는 조작은 STDF로.** 버튼·텍스트 입력·팝업·다이얼로그·진행률·스켈레톤·로딩·페이지 이동·알림(Toast/Alert)·바텀시트·액션시트는 STDF 네이티브다.
2. **링크는 `<a>`, 표는 `<table>`, 파일은 `<input type="file">`.** 설치판 STDF에는 링크 계약과 `Table`·`FileUpload`가 없다(§9).
3. 컴포넌트는 **데이터와 콜백만** 받는다. API·목·라우트를 모른다.
4. 한 컴포넌트는 **한 가지 업무 책임**만 진다. "모든 것을 하는 보드"를 만들지 않는다(MSM1의 1,314줄 경매 보드가 반면교사).
5. 모든 컴포넌트는 **정상·비활성·처리 중** 상태를 갖고, 비동기 영역은 `AsyncSection`으로 감싼다.

### 1.1. 검증된 STDF 3.0.0 제약 (설치판 소스 확인)

아래 제약은 설치판 소스로 확인했고 코드 골격에 이미 반영되어 있다. 새 컴포넌트를 만들 때도 지킨다.

| 제약 | 확인 근거 | plan 대응 |
| --- | --- | --- |
| 어떤 STDF 컴포넌트도 **알 수 없는 props를 전달하지 않는다**(`$$restProps` 없음). `aria-label`·`id`·`class`·`data-*`를 컴포넌트에 붙일 수 없다 | `grep -rn '\$\$restProps'` 결과 없음 | 필요한 ARIA는 안쪽 DOM에 직접. 아이콘 단독 조작은 native 버튼 + `aria-label`(화면 모드 토글) |
| **링크를 렌더하는 컴포넌트가 없다.** `Button`은 항상 `<div><button>`, `List`·`Cell` 행도 button | `button/Button.svelte:41-48`, `list/List.svelte:343-357` | 경로 이동은 native `<a>` |
| `Button size="md"\|"sm"`은 클래스 `.tdf-button-md/-sm`을 만들지만 **어떤 CSS에도 정의가 없다**(패딩 0) | `@any-tdf/common/dist/derived/button.js` | `size="full"`(폼 제출) 또는 `size="auto" injClass="px-4"`(인라인)만 사용 |
| `Popup`·`Dialog`·`Modal`·`ActionSheet` 계열은 **포커스 트랩·Escape·`role="dialog"`·`aria-modal`·배경 inert·스크롤 잠금이 전혀 없다**. 마스크는 라벨 없는 전면 `<button>` | `grep -rn Escape` 결과 없음, `popup/Popup.svelte:126-146`, `mask/Mask.svelte:31-39` | `TaskDialog`가 전부 보완(§4.7) |
| `Tag`는 항상 `role="button"` + `tabindex=0`(disabled가 아니면). 상태 라벨로 쓰면 표 한 행마다 포커스 정류장이 생긴다 | `tag/Tag.svelte:54-59` | 상태 라벨은 native `<span>`(§4.5) |
| `Tabs`는 `role="tablist"`·`aria-selected`·방향키가 없다. `Accordion`은 `aria-expanded`가 없다 | `tabs/Tab.svelte:90-134`, `accordion/Accordion.svelte:55-91` | Game 탭은 native 버튼 묶음, 이력 접기는 `<details>` |
| `Input`은 `name`을 지원하지 않고 `type`은 `text`/`password`만 실제 반영된다 | `C:/dist/derived/input.js` | 폼은 native `<form>` + 상태 수집, 숫자·날짜는 native |
| `Icon type="symbol"`(기본값)은 `/fonts/symbol.svg`를 요구하지만 STDF도 이 저장소도 그 파일을 제공하지 않는다 | `icon/Icon.svelte:15` | 아이콘은 children 스니펫 인라인 경로(§4.10) |
| `ko_KR`에 `pullRefresh`·`infiniteScroll` 문구가 없다 | `C:/dist/lang/ko_KR.js` | 두 컴포넌트를 쓰지 않는다(`AsyncSection` + `Pagination`) |

### 1.2. 버튼 사용 규칙

| 용도 | 사용 |
| --- | --- |
| 페이지·폼의 주 행동(폼 하단) | `<Button size="full" fill="base" state="theme">` |
| 인라인 행동(행 안, 도구줄) | `<Button size="auto" injClass="px-4" fill="line">`, 높이는 `heightIn="2"`로 44px 근처 유지 |
| 보조·파괴적 | `fill="line"` / `state="error"` + `ConfirmDialog` |
| 글자만(계정 메뉴 트리거 등) | `fill="text"` + `size="auto" injClass="px-2"` |
| 아이콘 단독 | 원칙적으로 만들지 않는다. 접근 가능한 이름이 꼭 필요한 아이콘 조작(화면 모드 토글)만 native `<button aria-label>` |
| 처리 중 | `loading={pending ? { height: '4', width: '4' } : null}` (기본 `disabledLoading=true`로 자동 비활성) |

## 2. 컴포넌트 지도

```text
shell/   SkipLink RouteFocus AppHeader ContextRail GuildSwitcher AccountMenu AppearanceToggle AppFooter
ui/      PageHeader SectionHeading NowLine AsyncSection DataTable StatusTag SideLabel FillMeter MetricList
         TaskDialog ConfirmDialog Field ChoiceGroup ServiceIcon EmptyHint PaginationBar
scrim/   ScrimBoard ScrimRow ScrimContextBar RosterTable RosterRow RegistrationDialog OperationsPanel RegistrationHistory
formation/ TeamFormationBoard TeamColumn PlayerChip AssignmentEditor AuctionConsole AuctionLotCard AuctionTeamRail AuctionLog
records/ MatchRow MatchFilterBar SeriesScore GameTabs ScoreboardTable PlayerGamePanel FearlessStrip RoflUploadDialog
player/  PlayerProfileHeader PlayerStatBand PositionMmrList PlayerGameList
stats/   StatSummary BreakdownTable ScopeSelect
document/ DocumentPage TocNav
```

## 3. 셸

### 3.1. `SkipLink`

| 항목 | 내용 |
| --- | --- |
| 역할 | 키보드 사용자가 헤더·레일을 건너 본문으로 이동 |
| 기반 | native `<a href="#main-content">` |
| 동작 | 포커스 시에만 보임. `main`은 `tabindex="-1"` |
| 코드 | `system.md`의 포커스 토큰 사용, 별도 색 지정 없음 |

```svelte
<a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-form)] focus:bg-surface-overlay focus:px-4 focus:py-2 focus:text-body-s">
	본문으로 건너뛰기
</a>
```

### 3.2. `AppHeader`

| 항목 | 내용 |
| --- | --- |
| props | `guild: GuildContext \| null`, `scrim: ScrimContext \| null`, `viewer: ViewerContext \| null` |
| 구성 | 브랜드 → (내전이면 문맥 표시) → 서버 선택기 → 여유 → 화면 모드 → 계정 |
| 레일 | `guild` 또는 `scrim`이 있으면 `ContextRail`을 같은 `<header>` 안에 둔다 |
| 상태 | 문맥 로딩 중(`navigating.to`에 `g` 경로)에는 서버명 자리에 `Skeleton width="24" height="4"` |
| 금지 | GitHub 링크, 별도 홈 메뉴, 본문용 메뉴 줄, 헤더 두 줄 고정(레일은 헤더의 일부) |

문맥 로딩 표시는 `$app/state`의 `navigating`으로 판단한다. 서버가 바뀌는 이동에서 이전 서버 이름이 새 서버 제목 아래 남지 않게 한다.

### 3.3. `ContextRail`

| 항목 | 내용 |
| --- | --- |
| props | `destinations: Destination[]`, `current: string`, `label: string`(`서버` \| `내전`) |
| 기반 | native `<nav aria-label={label}>` + `<a>` |
| 활성 | 가장 긴 `match` 접두사 하나만, `aria-current="page"` |
| 모바일 | 가로 스크롤 + `scroll-snap-type: x proximity`, 스크롤바 숨김, 첫 항목 스냅 |
| 데스크톱 | 같은 마크업, 하단 2px 시안 밑줄로 활성 표시 |
| 금지 | 목적지를 `Button`·`Tab`으로 만들기, 모바일 전용 메뉴 생성 |

```svelte
<script lang="ts">
	import type { Destination } from '$lib/shell/navigation';
	let { destinations, current, label }: { destinations: Destination[]; current: string; label: string } = $props();

	// 가장 구체적인(가장 긴) 경로 하나만 활성화한다.
	const active = $derived(
		destinations
			.filter((d) => (d.exact ? current === d.href : current === d.match || current.startsWith(`${d.match}/`)))
			.sort((a, b) => b.match.length - a.match.length)[0]?.href ?? null
	);
</script>

<nav aria-label={`${label} 메뉴`} class="border-t border-line">
	<ul class="shell flex h-(--app-rail-height) items-stretch gap-1 overflow-x-auto [scrollbar-width:none]">
		{#each destinations as destination (destination.href)}
			<li class="shrink-0">
				<a
					href={destination.href}
					aria-current={active === destination.href ? 'page' : undefined}
					class="flex h-full items-center border-b-2 px-3 text-body-s font-semibold whitespace-nowrap transition-colors
						{active === destination.href ? 'border-action text-fg' : 'border-transparent text-muted hover:text-fg'}"
				>
					{destination.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
```

### 3.4. `GuildSwitcher`

| 항목 | 내용 |
| --- | --- |
| props | `guild`, `viewer` |
| 위치 | 헤더 **오른쪽**, 화면 모드 토글 바로 왼쪽 |
| 기반 | native disclosure: 텍스트+캐럿 버튼 + 트리거에 붙는 링크 목록(STDF에는 링크를 담는 앵커 메뉴가 없다, §9) |
| 내용 | 현재 서버(표시 전용, `현재` 표시) → 다른 서버 `<a>` 목록 |
| 표시 조건 | `viewer`가 있을 때만 렌더(로그인 전 서버 목록을 알 수 없다) |
| 상태 | 목록 없음: "참여한 다른 서버가 없습니다." |
| 접근성 | `aria-expanded`·`aria-controls`, 열면 첫 이동 항목으로 포커스, Escape로 닫고 트리거로 복귀, 바깥 클릭·포커스 이탈 시 닫힘 |
| 금지 | 현재 서버를 링크로 만들기, 화면 하단 시트·모달처럼 화면을 덮는 패널로 만들기 |

> MSM1의 교훈: 서버 전환이 **항상 대시보드로 이동**해 맥락을 잃었다(`AppShell.svelte:192-194`). 새로울 것도
> 현재 서버 항목은 링크가 아니므로 같은 실수를 반복하지 않는다. 다른 서버로 갈 때는 그 서버 홈이 맞다(라우트 계약).

### 3.5. `AccountMenu` / `AppearanceToggle` / `AppFooter`

| 컴포넌트 | 내용 |
| --- | --- |
| `AccountMenu` | `viewer`가 있을 때만 렌더. `Button fill="text"` + `Popup`: 내 정보(`/me`) → 운영자면 백오피스 → 로그아웃(`Button fill="text" state="error"`). 아바타는 정적 이미지(버튼 아님) |
| `AppearanceToggle` | native `<button aria-label="다크 모드" aria-pressed>` + 해/달 아이콘(44px). STDF Button은 `aria-label`을 전달하지 못하므로 이 조작만 native다. 이름은 유지하고 `aria-pressed`로 현재 모드를 읽힌다. `appearance.svelte.ts`만 상태를 바꾼다. 로그인·설정 페이지에 같은 설정을 반복하지 않는다 |
| `AppFooter` | 워드마크(링크 아님) + 도메인 + 문서·이용약관·개인정보 링크. 모바일에서는 두 줄. 저장소·SNS 링크 없음 |

## 4. UI 기반

### 4.1. `PageHeader`

```svelte
<!-- 화면 최상단의 제목 + 선택적 주 행동. 주 행동은 페이지당 하나. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		kicker,
		description,
		actions
	}: { title: string; kicker?: string; description?: string; actions?: Snippet } = $props();
</script>

<div class="shell flex flex-wrap items-end justify-between gap-4 pt-6 pb-4">
	<div class="min-w-0">
		{#if kicker}<p class="category-label">{kicker}</p>{/if}
		<h1 class="text-title-xl text-fg">{title}</h1>
		{#if description}<p class="measure mt-1 text-body-s text-muted">{description}</p>{/if}
	</div>
	{#if actions}<div class="flex items-center gap-2">{@render actions()}</div>{/if}
</div>
```

`description`은 **제목을 다시 말하지 않는다**. "현재 대상·범위"처럼 다른 정보를 담을 때만 쓴다.

### 4.2. `NowLine` — "지금 줄"

서버 홈·내전 요약 상단에서 **현재 상태와 다음 행동 하나**를 보여주는 띠. MSM1의 운영 큐(`OperationsQueueBoard`)에서
가져온 최고의 아이디어를 위젯 하나로 압축한 것이다.

| props | 내용 |
| --- | --- |
| `tone` | `info` \| `warning` \| `success` \| `danger` |
| `statements` | 지금 상태를 말하는 한 문장(서버가 준 값) |
| `action` | `{ label, href }` 또는 `{ label, onclick, disabledReason }` — **최대 1개** |
| `who` | `'viewer' \| 'operator'` — 같은 줄의 문장을 역할에 맞게 바꾼다 |

```svelte
<div class="shell">
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-box)] border border-line bg-surface-card px-4 py-3">
		<p class="flex items-center gap-2 text-body-s">
			<span class="h-2 w-2 rounded-full" style:background="var(--{tone === 'info' ? 'info' : tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'danger'})" aria-hidden="true"></span>
			{statements}
		</p>
		{#if action}
			<Button size="md" fill="base" state="theme" disabled={!!action.disabledReason} onclick={action.onclick}>
				{action.label}
			</Button>
		{/if}
	</div>
</div>
```

### 4.3. `AsyncSection`

[architecture.md §7.2](architecture.md#72-비동기-영역-하나로-통일)의 구현. 모든 조회 영역은 이 컴포넌트를 통과한다.

```svelte
<AsyncSection result={home.recentMatches} label="최근 경기" emptyText="아직 기록된 경기가 없습니다." onretry={...}>
	{#snippet children(matches)}...{/snippet}
</AsyncSection>
```

- `result: Loadable<T>`(`{ status: 'ready', data }` 또는 `{ status: 'error', message }`) 또는 `null`(로딩)을 받는다.
- 상태 판정: `loading` → `null` → `error` → 빈 값(배열 길이 0 또는 `isEmpty`) → 정상. **상태 계산을 페이지마다 다시 쓰지 않는다.**
- `Skeleton`은 실제 레이아웃 모양의 줄 수로 만들고, 오류는 문장 + 재시도 1개, 빈 상태는 문장 1개다.

### 4.4. `DataTable`

| 항목 | 내용 |
| --- | --- |
| 기반 | native `<table>` (설치판 STDF에 `Table` 없음) |
| props | `caption`(시각적 숨김 가능), `columns: { label: string; align?: 'start' \| 'end'; width?: string; hideInStack?: boolean }[]`, `row: Snippet<[item: T, index: number]>`, `items: T[]`, `emptyText?` |
| 데스크톱 | `--line` 헤더 밑줄, 44px 행, 숫자 열 `text-end tabular` |
| 모바일(< 64rem) | 같은 DOM을 스택 카드로 재배치: `tbody tr`를 블록으로, `td::before`에 `data-label` 출력. 표 컨테이너만 가로 스크롤이 필요하면 `overflow-x-auto` |
| 접근성 | `<caption>` 제공, 헤더 `<th scope="col">`, 행 머리 셀은 `<th scope="row">` |

```svelte
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	interface Column {
		label: string;
		align?: 'start' | 'end';
		width?: string;
		/** 모바일 스택에서 숨길 열 */
		hideInStack?: boolean;
	}

	let {
		columns,
		items,
		row,
		caption,
		emptyText = '표시할 항목이 없습니다.',
		stickyHeader = false
	}: {
		columns: Column[];
		items: T[];
		row: Snippet<[item: T, index: number]>;
		caption: string;
		emptyText?: string;
		stickyHeader?: boolean;
	} = $props();
</script>

{#if items.length === 0}
	<p class="py-6 text-body-s text-muted">{emptyText}</p>
{:else}
	<div class="data-table-container overflow-x-auto">
		<table class="data-table w-full border-collapse text-body-s">
			<caption class="sr-only">{caption}</caption>
			<thead class:sticky={stickyHeader}>
				<tr class="border-b border-line-strong text-left">
					{#each columns as column (column.label)}
						<th
							scope="col"
							style:width={column.width}
							class="py-2 pr-4 font-semibold text-muted {column.align === 'end' ? 'text-end' : ''} {column.hideInStack ? 'hide-in-stack' : ''}"
						>
							{column.label}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-[var(--line)]">
				{#each items as item, index (index)}
					{@render row(item, index)}
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	@media (max-width: 63.999rem) {
		.data-table thead {
			display: none;
		}
		.data-table tr {
			display: block;
			padding-block: 0.75rem;
		}
		/* 셀은 라벨·값 두 칸으로 재배치한다. 라벨은 data-label에서 온다. */
		:global(.data-table td),
		:global(.data-table th[scope='row']) {
			display: grid;
			grid-template-columns: 7rem 1fr;
			gap: 0.5rem;
			padding: 0.125rem 0;
			text-align: start !important;
		}
		:global(.data-table td::before),
		:global(.data-table th[scope='row']::before) {
			content: attr(data-label);
			color: var(--text-muted);
			font-weight: 600;
		}
		:global(.data-table .hide-in-stack) {
			display: none;
		}
	}
</style>
```

행 셀은 다음과 같이 쓴다: `<td data-label="인원" class="tabular text-end">7 / 10</td>`.

### 4.5. `StatusTag` — 상태 문구의 단일 출처

DB enum을 **화면 문구와 톤**으로 바꾸는 유일한 함수. 화면마다 다른 동의어를 만들지 않는다(MSM1 P7).

```ts
// src/lib/components/ui/status.ts
import type { AuctionStatus, GameStatus, LotStatus, MatchStatus, RegistrationStatus, ScrimStatus } from '$lib/data/types';

type Tone = 'theme' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
export interface StatusMeta {
	text: string;
	tone: Tone;
}

// 사용자가 이미 익숙한 MSM1 용어를 유지한다.
export const SCRIM_STATUS: Record<ScrimStatus, StatusMeta> = {
	recruit: { text: '모집 중', tone: 'info' },
	preparing: { text: '편성 중', tone: 'info' },
	ready: { text: '편성 완료', tone: 'success' },
	in_progress: { text: '진행 중', tone: 'info' },
	completed: { text: '종료', tone: 'neutral' },
	ended_early: { text: '중도 종료', tone: 'warning' },
	cancelled: { text: '취소', tone: 'error' }
};

export const REGISTRATION_STATUS: Record<RegistrationStatus, StatusMeta> = {
	pending: { text: '신청', tone: 'neutral' },
	selected: { text: '선발', tone: 'success' },
	standby: { text: '대기', tone: 'warning' },
	withdrawn: { text: '철회', tone: 'neutral' },
	excluded: { text: '제외', tone: 'error' }
};

export const MATCH_STATUS: Record<MatchStatus, StatusMeta> = {
	pending: { text: '예정', tone: 'neutral' },
	in_progress: { text: '진행 중', tone: 'info' },
	completed: { text: '종료', tone: 'success' },
	ended_early: { text: '중도 종료', tone: 'warning' },
	cancelled: { text: '취소', tone: 'error' }
};

export const GAME_STATUS: Record<GameStatus, StatusMeta> = {
	pending: { text: '예정', tone: 'neutral' },
	in_progress: { text: '진행 중', tone: 'info' },
	awaiting_result: { text: '결과 대기', tone: 'warning' },
	completed: { text: '기록됨', tone: 'success' },
	cancelled: { text: '취소', tone: 'error' }
};

export const AUCTION_STATUS: Record<AuctionStatus, StatusMeta> = {
	setup: { text: '경매 준비', tone: 'neutral' },
	in_progress: { text: '입찰 진행', tone: 'info' },
	completed: { text: '경매 완료', tone: 'success' },
	cancelled: { text: '경매 취소', tone: 'error' }
};

export const LOT_STATUS: Record<LotStatus, StatusMeta> = {
	open: { text: '입찰 중', tone: 'info' },
	sold: { text: '낙찰', tone: 'success' },
	unsold: { text: '유찰', tone: 'warning' },
	cancelled: { text: '취소', tone: 'error' }
};
```

```svelte
<!-- StatusTag.svelte — 상태 라벨은 조작이 아니므로 STDF Tag 대신 native span을 쓴다. -->
<script lang="ts">
	import type { StatusMeta } from './status';
	let { status }: { status: StatusMeta } = $props();

	// 톤 → 의미 토큰. 색은 보조 신호이며 라벨 텍스트가 항상 함께 읽힌다.
	const tone = {
		theme: '--info',
		success: '--success',
		warning: '--warning',
		error: '--danger',
		info: '--info',
		neutral: '--text-muted'
	} as const;
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption leading-5"
	style:border-color={`color-mix(in oklab, var(${tone[status.tone]}) 35%, transparent)`}
	style:color={`var(${tone[status.tone]})`}
>
	<span class="size-1.5 rounded-full" style:background={`var(${tone[status.tone]})`} aria-hidden="true"></span>
	{status.text}
</span>
```

> 근거: STDF `Tag`는 무조건 `role="button"` + `tabindex=0`으로 렌더된다(`tag/Tag.svelte:54-59`).
> 표 한 행의 상태마다 포커스 정류장이 생기고 스크린리더가 "버튼"으로 읽으므로 **표시용 상태 라벨에는 쓸 수 없다**.
> `Tag`는 사용자가 닫거나 누르는 태그(예: 필터 칩)에만 쓴다.

- 같은 상태를 태그와 문장으로 두 번 표시하지 않는다. `NowLine` 문장에는 상태 라벨을 넣지 않고 다음 행동만 말한다.
- "입찰 중"과 "선발"처럼 **서로 다른 축**의 상태는 한 행에 동시에 쓸 수 있다. 같은 축의 상태는 하나만 표시한다.

### 4.6. `FillMeter` / `MetricList` / `SideLabel`

| 컴포넌트 | props | STDF | 규칙 |
| --- | --- | --- | --- |
| `FillMeter` | `current`, `total`, `label`, `tone?` | `Progress` | `percent = round(current/total*100)`, 텍스트 `7 / 10`. `role="progressbar"` 대신 텍스트를 항상 함께 둔다 |
| `MetricList` | `items: { label, value, unit?, hint? }[]` | 없음 | `<dl>` 2열 그리드. 카드 아님. 값은 `.tabular` |
| `SideLabel` | `side: 'blue' \| 'red' \| 'a' \| 'b'` | `Tag` | 색 + **텍스트**(`블루`/`레드`). 색만으로 구분하지 않는다 |

### 4.7. `TaskDialog` — 서비스 입력 패널

STDF `Popup`에는 포커스 트랩·Escape·`aria-modal`이 없다(§8 확인). 서비스가 **한 곳에서** 보완한다.

```svelte
<script lang="ts">
	import { Popup, Button } from 'stdf';
	import type { Snippet } from 'svelte';
	import { focusables } from './focus';

	let {
		open = $bindable(false),
		title,
		description,
		submitLabel,
		submitState = 'idle',
		submitError,
		canSubmit = true,
		onsubmit,
		onclosed,
		children,
		footer
	}: {
		open: boolean;
		title: string;
		description?: string;
		submitLabel: string;
		submitState?: 'idle' | 'pending' | 'failed';
		submitError?: string;
		canSubmit?: boolean;
		onsubmit: () => void;
		onclosed?: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let dialog: HTMLDivElement | undefined = $state();
	let trigger: HTMLElement | null = null;

	$effect(() => {
		if (!open) return;
		trigger = document.activeElement as HTMLElement | null;
		// 배경을 inert로 막고 첫 입력으로 포커스를 옮긴다.
		const first = dialog ? focusables(dialog)[0] : undefined;
		requestAnimationFrame(() => first?.focus());

		const onKeydown = (event: KeyboardEvent) => {
			if (!dialog) return;
			if (event.key === 'Escape' && submitState !== 'pending') {
				event.preventDefault();
				close();
				return;
			}
			if (event.key !== 'Tab') return;
			// 마지막에서 Tab, 처음에서 Shift+Tab이면 대화상자 안에서 순환한다.
			const items = focusables(dialog);
			if (items.length === 0) return;
			const firstEl = items[0];
			const lastEl = items[items.length - 1];
			if (event.shiftKey && document.activeElement === firstEl) {
				event.preventDefault();
				lastEl.focus();
			} else if (!event.shiftKey && document.activeElement === lastEl) {
				event.preventDefault();
				firstEl.focus();
			}
		};
		document.addEventListener('keydown', onKeydown, true);
		return () => document.removeEventListener('keydown', onKeydown, true);
	});

	function close() {
		open = false;
		onclosed?.();
		// 사라진 요소로 복귀하지 않는다.
		requestAnimationFrame(() => (trigger?.isConnected ? trigger.focus() : document.getElementById('main-content')?.focus()));
	}
</script>

<!-- Popup의 size는 뷰포트 비율(%). 0이면 내용 높이에 맞춘다. -->
<Popup visible={open} position="center" size={0} maskClosable={false} radius="md" onclose={() => submitState !== 'pending' && close()}>
	<div
		bind:this={dialog}
		role="dialog"
		aria-modal="true"
		aria-labelledby={`${title}-label`}
		class="flex max-h-[85dvh] flex-col bg-surface-overlay"
	>
		<div class="border-b border-line px-5 pt-5 pb-3">
			<h2 id={`${title}-label`} class="text-title-l">{title}</h2>
			{#if description}<p class="mt-1 text-body-s text-muted">{description}</p>{/if}
		</div>
		<div class="overflow-y-auto px-5 py-4">{@render children()}</div>
		<div class="space-y-3 border-t border-line px-5 py-4">
			{#if submitError}<p role="alert" class="text-body-s" style:color="var(--danger)">{submitError}</p>{/if}
			<div class="flex justify-end gap-2">
				{#if footer}{@render footer()}{/if}
				<Button fill="line" size="md" disabled={submitState === 'pending'} onclick={close}>닫기</Button>
				<Button fill="base" state="theme" size="md" loading={submitState === 'pending' ? {} : null} onclick={onsubmit}>
					{submitLabel}
				</Button>
			</div>
		</div>
	</div>
</Popup>
```

- 닫기 컨트롤은 **하단 하나**. 제목 옆 X를 두지 않는다.
- 처리 중에는 `maskClosable`·Escape·닫기 모두 막고, `loading`을 표시한다.
- `footer`는 파괴적 작업(철회·제외)의 보조 동작에만 쓴다.

### 4.8. `Field` / `ChoiceGroup`

| 컴포넌트 | 용도 | 구현 |
| --- | --- | --- |
| `Field` | 텍스트 입력 | STDF `Input` (`title`, `state`, `tip`, `value`, `onchange`). 오류는 `state="error"` + `tip` |
| `NativeField` | select·number·datetime·checkbox·file | `<label for>` + native 컨트롤 + `aria-describedby` 오류/힌트 |
| `ChoiceGroup` | BO·편성 방식 등 배타 선택 | `<fieldset>` + `<legend>` + native radio, 카드형 라벨 |

```svelte
<!-- NativeField.svelte -->
<script lang="ts" generics="T extends string | number">
	import type { Snippet } from 'svelte';
	let {
		id,
		label,
		hint,
		error,
		children
	}: { id: string; label: string; hint?: string; error?: string; children: Snippet<[descriptorIds: string]> } = $props();

	const hintId = $derived(hint ? `${id}-hint` : undefined);
	const errorId = $derived(error ? `${id}-error` : undefined);
	const describedBy = $derived([hintId, errorId].filter(Boolean).join(' ') || undefined);
</script>

<div class="space-y-1">
	<label for={id} class="block text-body-s font-semibold">{label}</label>
	{@render children(describedBy ?? '')}
	{#if hint}<p id={hintId} class="text-caption text-muted">{hint}</p>{/if}
	{#if error}<p id={errorId} class="text-caption" style:color="var(--danger)">{error}</p>{/if}
</div>
```

> 한글 조합 중 Enter 제출 방지: 폼 컨테이너에서 `if (event.isComposing) return;`.

### 4.9. `PaginationBar`

STDF `Pagination`을 직접 쓰되 `total <= pageSize`면 렌더하지 않는다. `maxShowPage={5}`.
페이지 변경은 URL(`?page=`)만 갱신하고, `onchange` 하나만 조회에 연결한다(`onnext`·`onpre`와 동시 연결 금지).

### 4.10. `ServiceIcon`

| 항목 | 내용 |
| --- | --- |
| 기반 | STDF `Icon`의 `children` 스니펫 + 24px 인라인 경로 레지스트리 |
| 이름 | `users`, `swords`, `trophy`, `timer`, `coins`, `flag`, `chart`, `shield`, `settings`, `upload`, `refresh`, `chevron`, `external`, `check`, `alert` |
| 규칙 | 텍스트와 함께 쓸 때 `aria-hidden="true"`. 단독 버튼은 `aria-label` 필수 |
| 금지 | 아이콘 라이브러리 추가, 페이지별 인라인 SVG |

## 5. 내전(모집·참가)

### 5.1. `ScrimBoard` / `ScrimRow`

| 항목 | 내용 |
| --- | --- |
| `ScrimBoard` | `scrims: ScrimSummary[]`, `state`(AsyncSection에 위임). 필터는 부모가 소유 |
| `ScrimRow` | 한 내전 = 한 링크. 좌측 상태 레일(4px, 톤), 제목, 예정 시각, `FillMeter`, 편성 방식, 상태 `StatusTag` |
| 데스크톱 | 표형 행(제목·시각·인원·방식·상태) |
| 모바일 | 같은 행을 2줄로 재배치: 1줄 제목+상태, 2줄 시각·인원·방식 |
| 금지 | 행 안에 두 번째 링크·행동 버튼, 카드 격자 |

```svelte
<!-- ScrimRow.svelte (요지) -->
<li class="border-b border-line last:border-0">
	<a href={href} class="grid gap-1 px-1 py-3 hover:bg-surface-raised focus-visible:outline-offset-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4">
		<span class="min-w-0">
			<span class="block truncate text-title-m">{scrim.title}</span>
			<span class="text-caption text-muted tabular">{formatStart(scrim.expectedStartAt)}</span>
		</span>
		<FillMeter current={scrim.selectedCount} total={scrim.playingCapacity} label="선발 인원" compact />
		<span class="text-caption text-muted">{scrim.formationMethod ? FORMATION_LABEL[scrim.formationMethod] : '편성 방식 미정'}</span>
		<StatusTag status={SCRIM_STATUS[scrim.status]} />
	</a>
</li>
```

### 5.2. `ScrimContextBar`

헤더가 내전 이름·상태를 이미 보여주므로, 여기서는 **부가 사실만** 나열한다:
`10인 · 경매 편성 · 하드 피어리스 · 10/29(목) 20:00 시작` — `MetricList`의 한 줄 구성(모바일은 2줄).
같은 값을 `NowLine`·`PageHeader`에서 다시 말하지 않는다.

### 5.3. `RosterTable` / `RosterRow`

| 항목 | 내용 |
| --- | --- |
| 데이터 | `registrations: Registration[]`, `viewerId`, `capabilities: { canManage: boolean }`, `onmanage(participantId)` |
| 정렬 | 본인 행 고정(top) → 선발 → 대기 → 신청 → 철회/제외. 같은 상태는 신청 시각 |
| 열 | 참가자(이름·Riot ID), 희망 포지션, 상태, (관리자만) 관리 버튼 |
| 관리 버튼 | STDF `Button fill="line" size="sm"` → 행 아래 `AssignmentEditor`/`OperationsPanel` 펼침. **한 번에 하나만 열린다** |
| 빈 상태 | "아직 신청한 참가자가 없습니다." (신청 버튼은 상단 `NowLine`에만) |
| 접근성 | `DataTable` 사용, 본인 행에 `aria-current="true"` + "나" 태그 |

### 5.4. `RegistrationDialog` — 참가 신청/변경/철회

| 상태 | 화면 |
| --- | --- |
| 미계정 연결 | 신청 필드를 그리지 않고 "Riot 계정 연결이 필요합니다" + `/me` 링크 1개(계정 연결은 그 페이지 책임) |
| 신청 | 희망 포지션 1순위(필수)·2순위(선택) → 제출 |
| 변경 | 현재 값 프리필, 같은 폼 |
| 철회 | 확인 문장 + `철회` 버튼(파괴적 → `state="error"`) |
| 불가 | 이유 문장("정원이 찼습니다", "모집이 마감되었습니다") + 닫기만 |

- `TaskDialog` 하나로 세 목적을 처리하고, 제목·제출 라벨만 바꾼다(중복 패널 금지).
- 성공 후 패널을 닫고 본인 행으로 포커스를 옮긴다. 성공 토스트를 띄우지 않는다(행 상태가 결과를 보여준다).

### 5.5. `OperationsPanel` / `RegistrationHistory`

| 항목 | 내용 |
| --- | --- |
| `OperationsPanel` | 대상 1명·가능한 상태(pending→선발/대기/제외) 네이티브 radio + 사유 `Input`(제외에만) + 제출 |
| `RegistrationHistory` | native `<details><summary>`: 참가자별 신청·철회·제외 이력(설치 `Accordion`은 `aria-expanded`가 없어 접힘 상태가 읽히지 않는다). **필수 정보(현재 상태)를 접지 않는다** |
| 제약 | 모든 조작은 서버가 반환한 `capabilities`로 노출. 클라이언트 추론 금지 |

## 6. 편성 — 엔트리·경매

### 6.1. `TeamFormationBoard` (엔트리·경매 완료 공용)

MSM1 최악의 UX(P1: 드래그 전용)를 구조적으로 제거한다.

| 항목 | 내용 |
| --- | --- |
| 레이아웃 | 데스크톱: `[미배정 풀] [팀 A] [팀 B]` / 20인: 2행. 모바일: 미배정 → 팀 A → 팀 B 세로 |
| 조작 | **선택 → 배치 2단계**: 참가자 카드 선택(버튼) → 대상 포지션 슬롯 선택(버튼). 드래그는 보조(있어도 동작은 동일) |
| 상태 | 선택된 참가자 하이라이트 + 상단 안내("참가자를 선택한 뒤 팀 슬롯을 선택하세요"), 빈 슬롯은 명시적 버튼(`+ 탑`) |
| 충돌 | 이미 찬 슬롯 선택 시 교체 확인을 인라인으로 1회(또는 해당 참가자를 미배정으로 이동) |
| 저장 | 로컬 초안 → `편성 확정` 한 번 커밋(MSM1 P2의 "이동마다 서버 쓰기" 제거). 확정 전 `저장되지 않음` 표시 |
| 확정 | 정원·중복·포지션 검증 결과를 인라인 목록으로, 실패 시 첫 문제 슬롯으로 포커스 |

```svelte
<!-- TeamColumn.svelte (요지) -->
<section class="rounded-[var(--radius-box)] border border-line bg-surface-card" class:rail-a={team.side === 'a'} class:rail-b={team.side === 'b'} aria-labelledby={`team-${team.id}`}>
	<header class="flex items-center justify-between px-4 py-3">
		<h3 id={`team-${team.id}`} class="text-title-m">{team.name}</h3>
		<SideLabel side={team.side} />
	</header>
	<ol class="divide-y divide-[var(--line)]">
		{#each POSITIONS as position (position)}
			{@const occupied = team.slots[position]}
			<li>
				<button
					type="button"
					class="flex min-h-11 w-full items-center gap-3 px-4 text-left"
					aria-label={`${team.name} ${POSITION_LABEL[position]} ${occupied ? occupied.displayName : '빈 슬롯'}`}
					onclick={() => onpick(team.id, position)}
					disabled={!canEdit}
				>
					<span class="w-12 text-caption text-muted">{POSITION_LABEL[position]}</span>
					{#if occupied}
						<PlayerChip participant={occupied} selected={selectedId === occupied.participantId} />
					{:else}
						<span class="text-body-s text-faint">+ 배치</span>
					{/if}
				</button>
			</li>
		{/each}
	</ol>
</section>
```

### 6.2. `AuctionConsole`

| 영역 | 컴포넌트 | 목적 |
| --- | --- | --- |
| ① 후보 | `AuctionLotCard` | 현재 후보·포지션·최근 전적 요약, 입찰가 입력, `낙찰`/`유찰` |
| ② 팀 | `AuctionTeamRail` ×2–4 | 팀명·팀장, 잔여 포인트, 잔여 슬롯, 영입 목록 |
| ③ 이력 | `AuctionLog` | 후보 등장·낙찰·유찰·정정의 전체 로그 |
| ④ 다음 | `Button fill="line"` | `다음 후보` (순서대로, 무작위 아님) |

**MSM1의 교훈을 규칙으로 고정한다**

| MSM1 문제 | 이 계획의 규칙 |
| --- | --- |
| 가짜 10초 타이머(P4) | 타이머를 만들지 않는다. 서버가 마감 시각을 주는 계약이 생기면 그때 표시만 |
| `±10` 우클릭(P4) | 명시적 `−` `+` 버튼 또는 숫자 입력. 우클릭·롱프레스 숨은 제스처 금지 |
| 구매 이력 없음(P4) | `AuctionLog`가 1급 화면 요소 |
| 실행 취소가 페이지마다 3곳(P5) | 되돌리기는 `AuctionLog`의 마지막 항목 옆 **한 곳** |
| 한 운영자가 모든 팀 입찰을 입력 | 같은 화면에서 팀별 입력을 한 번에 제출하지 않고, **선택한 한 팀의 입찰만** 제출(오낙찰 위험 축소), 낙찰 전 잔여 포인트 확인 문장 1회 |

```svelte
<!-- AuctionLotCard.svelte (요지) -->
<article class="rounded-[var(--radius-box)] border border-line bg-surface-card p-4">
	<p class="category-label">현재 후보 · {lot.sequence}번째</p>
	<div class="mt-2 flex items-baseline justify-between gap-3">
		<h2 class="text-title-l">{lot.player.displayName}</h2>
		<span class="text-caption text-muted">{POSITION_LABEL[lot.position ?? 'top']}</span>
	</div>
	<MetricList items={lot.metrics} class="mt-3" />
	<div class="mt-4 flex flex-wrap items-end gap-3">
		<NativeField id="bid-team" label="낙찰 팀">
			{#snippet children(described)}
				<select id="bid-team" class="min-h-11 rounded-[var(--radius-form)] border border-line bg-surface-sunken px-3" {described} bind:value={teamId}>
					{#each openTeams as team (team.id)}<option value={team.id}>{team.name} · 잔여 {team.remaining}P</option>{/each}
				</select>
			{/snippet}
		</NativeField>
		<NativeField id="bid-price" label="입찰가" error={priceError}>
			{#snippet children(described)}
				<input id="bid-price" type="number" min="0" max={maxPrice} class="min-h-11 w-32 rounded-[var(--radius-form)] border border-line bg-surface-sunken px-3 text-end tabular" {described} bind:value={price} />
			{/snippet}
		</NativeField>
		<Button fill="base" state="theme" size="md" disabled={!canAward} onclick={() => onsubmit({ teamId, price })}>낙찰</Button>
		<Button fill="line" size="md" onclick={onunsold}>유찰</Button>
	</div>
	{#if awardPreview}
		<p class="mt-2 text-caption text-muted">{awardPreview}</p>
	{/if}
</article>
```

### 6.3. `AuctionTeamRail` / `AuctionLog`

| 컴포넌트 | 내용 |
| --- | --- |
| `AuctionTeamRail` | 팀명·팀장 배지, `잔여 {n}P`(대형 tabular), `FillMeter`(정원), 영입 목록(가격·방식 배지 `낙찰`/`수동`/`팀장`) |
| `AuctionLog` | `DataTable`(순번·후보·처리·팀·가격·시각), 최신이 위. 행 상태 `LotStatus`. 정정된 항목은 취소선 + "정정됨" 태그 |
| 상태 | 경매 `setup`: 준비 폼(팀장·시작 포인트) / `completed`: 최종 팀 + 이력만 / `cancelled`: 이력 유지 |

### 6.4. `BracketBoard` / `BracketMatchCard`

| 항목 | 내용 |
| --- | --- |
| 레이아웃 | 데스크톱: 라운드 열(`준결승 A`·`준결승 B` → `결승`). 모바일: 라운드 세로 스택 |
| 카드 | 두 자리(팀명 또는 `1R 1경기 승자`·`미정`), BO 배지, 시리즈 점수(대형 Jersey 숫자), 상태 |
| 링크 | 연결된 Match가 있으면 카드 제목 하나만 링크. 없으면 링크 없음(미정 경기를 가짜로 만들지 않는다) |
| 편집 | `편집` 모드에서 슬롯 클릭 → 팀/출처 선택(2단계). 편집 중이 아니면 읽기 전용 |
| 모바일 | 가로 스크롤 브래킷 금지. 라운드별 세로 목록 |

## 7. 기록 — 경기·성적·전적·통계

### 7.1. `MatchRow` / `MatchFilterBar`

| 항목 | 내용 |
| --- | --- |
| `MatchRow` | 두 팀(좌우) + 가운데 시리즈 점수(대형 숫자) + 상태/시각. 행 전체 1링크 |
| `MatchFilterBar` | 검색 `Input`(STDF) 1개 + 상태 native select + `조회` `Button`. URL 갱신, 첫 오류 포커스 |
| 모바일 | 팀·점수를 첫 줄, 내전명·시각·상태 둘째 줄 |

### 7.2. `SeriesScore` / `GameTabs` / `ScoreboardTable` / `PlayerGamePanel` / `FearlessStrip`

```text
SeriesScore:   팀 A   [ 2 : 1 ]   팀 B      BO5 · 종료 · 10경기? 아니고 Game 3
GameTabs:      1경기 | 2경기 | 3경기        (?game=)
ScoreboardTable: 팀 A (블루) 행 5개 → 팀 B (레드) 행 5개
PlayerGamePanel: 선택 선수 상세(전투·경제·시야·최종 아이템)
FearlessStrip:  하드 피어리스 사용 이력(이전 Game에서 사용한 챔피언, 팀별)
```

| 컴포넌트 | STDF | 규칙 |
| --- | --- | --- |
| `SeriesScore` | 없음 | Jersey 숫자, `aria-label="시리즈 점수 팀A 2, 팀B 1"`, 승자는 색+`승` 라벨 |
| `GameTabs` | native `<a>` 목록 | 설치 `Tabs`는 tablist 역할·`aria-selected`·방향키가 없어(§1.1) 반쪽 탭이 된다. 각 Game은 **다른 결과를 가진 링크**(`?game=`)이므로 `<nav aria-label="경기 선택">` + `<a aria-current="page">`가 맞다. 새 탭·뒤로가기가 그대로 동작한다 |
| `ScoreboardTable` | `DataTable` | 팀별 5행 그룹, 행 머리 = 선수명. 열: 챔피언·포지션·K/D/A·CS·골드·시야·`상세` |
| `PlayerGamePanel` | `Card`(정적) | 데스크톱: 표 오른쪽 패널 / 모바일: 선택한 행 바로 아래. K/D/A·CS를 다시 쓰지 않고 추가 수치·아이템만 |
| `FearlessStrip` | `Tag` 목록 | 적용된 Match에만. 챔피언 이름 목록을 팀별로 |

### 7.3. `RoflUploadDialog`

```text
제목: ROFL 등록
대상: {내전명} · {팀A} vs {팀B} · {BO}            (조회 중인 Game과 등록 대상이 다를 수 있음을 명시)
[파일 선택]  선택한 파일명 (.rofl)
결과/오류 문장 1곳
                              [닫기]  [등록]
```

| 상태 | 규칙 |
| --- | --- |
| 미선택 | 등록 비활성 |
| 선택 | 파일명·크기·확장자 검증 문장 |
| 전송 중 | 제출 `loading`, 파일 교체·닫기 비활성, 측정되지 않은 퍼센트 금지 |
| 성공 | 결과 목록으로 전환 후 `확인` 하나로 닫고 해당 Game 선택 |
| 실패 | 원인 문장 + `다른 파일 선택` (수동 승패 입력으로 우회하는 길 없음) |
| 응답 불확실 | `등록 상태 확인` 버튼, 무조건 재전송 금지 |

`TaskDialog` 기반 + native `<input type="file">` 하나. 드롭존을 별도로 만들지 않는다.

### 7.4. `PlayerProfileHeader` / `PlayerStatBand` / `PositionMmrList` / `PlayerGameList`

| 컴포넌트 | 내용 |
| --- | --- |
| `PlayerProfileHeader` | 이름·Riot ID(공개 시)·서버 배지. 편집 없음 |
| `PlayerStatBand` | 출전 Game·승/패·승률 — `MetricList`, 숫자 대형 |
| `PositionMmrList` | 5포지션 `Progress` 막대 + 값 + 시즌 라벨. 반영 보류는 `StatusTag`(경고 톤) |
| `PlayerGameList` | `DataTable`(시리즈·Game·챔피언·승패·시각) 행 1링크 → `/matches/[matchId]?game=` |

### 7.5. `StatSummary` / `BreakdownTable` / `ScopeSelect`

| 컴포넌트 | 내용 |
| --- | --- |
| `ScopeSelect` | 기간·시즌 native select(라벨 연결), URL 동기화 |
| `StatSummary` | 완료 Game·참가자·평균 길이 (MetricList) |
| `BreakdownTable` | 포지션/챔피언 집계. 열 정의는 서버 계약에서, 없으면 탭을 만들지 않는다 |

## 8. 문서

| 컴포넌트 | 내용 |
| --- | --- |
| `DocumentPage` | `title`, `appliedAt?`, `sections: { id, title, content: Snippet }[]` — 42rem 한 열, 제목 계층 h1→h2 |
| `TocNav` | 본문 상단 목차(`<nav aria-label="목차">` + 내부 앵커). 고정 사이드바 없음(모바일·데스크톱 동일) |

## 9. 네이티브 예외 목록

이 표에 있는 것만 native로 만든다. 근거는 설치판 `stdf@3.0.0`의 선언·소스다.

| UI | STDF에 없는 이유 | 대체 | 사용처 |
| --- | --- | --- | --- |
| 라우트 링크·목록 행 | `Tab`·`List`·`Cell` 항목이 button이며 `href` 계약 없음 | `<a>` | 레일·목록·행 |
| 상태 라벨 | `Tag`가 항상 `role="button"` + `tabindex=0` → 조작이 아닌 것에 포커스가 생긴다 | native `<span>` + 의미 토큰 | 표·행·카드의 상태 |
| Game 선택 탭 | `Tabs`에 tablist 역할·`aria-selected`·방향키 없음 | `<nav>` + `<a aria-current>` | 경기 상세 |
| 접기/펼치기 이력 | `Accordion`에 `aria-expanded`·`aria-controls` 없음, 접힌 내용이 DOM에서 제거됨 | `<details>` + `<summary>` | 참가 이력, 정책 부록 |
| 표 | `Table` export 없음 | `<table>` + `DataTable` | 성적·통계·로그 |
| 단일 선택 | `Picker`의 내부 스크롤 항목이 키보드 선택·선택 상태 연결을 보장하지 않음 | native `<select>` | 팀·포지션·범위·필터 |
| 배타 선택 | `Radio`·`CheckboxItem`이 `role`/`checked`와 그룹 라벨을 자동 보장하지 않음 | `<fieldset>` + native radio | BO·편성 방식·선발 처리 |
| 불리언 | `Switch`의 라벨·상태 연결 불충분 | native checkbox + label | 하드 피어리스 |
| 숫자·시각 | `Stepper`는 직접 입력·라벨 계약 없음, `TimePicker`는 스크롤 선택 | `type="number"`, `datetime-local` | 정원·포인트·예정 시각 |
| 파일 | `Input`에 file 타입 없음, FileUpload 없음 | `<input type="file">` | ROFL |
| 아이콘 단독 토글 | STDF 컴포넌트에 `aria-label`을 줄 수 없어 아이콘만 있는 버튼의 이름을 만들 수 없음 | native `<button aria-label aria-pressed>` | 헤더 화면 모드 토글 |
| 서버 선택 드롭다운 | STDF `ActionPopover`는 항목이 `button`이고, `Popup`은 트리거에 붙지 않고 화면을 덮는다. 서버 이동은 링크여야 새 탭·주소 복사가 된다 | native disclosure(버튼 + `aria-expanded` + 링크 목록) | 헤더 서버 선택 |
| 스크롤 영역 상태 | `PullRefresh`·`InfiniteScroll`은 모바일 제스처 전용 | `AsyncSection` + `Pagination` | 목록 |

## 10. 컴포넌트 검토 체크리스트

- [ ] props에 API·목·라우트 이름이 없다.
- [ ] 정상·빈·오류·처리 중·비활성 상태가 모두 정의됐다.
- [ ] 같은 목적지의 링크·버튼이 컴포넌트 안에서 둘 이상 아니다.
- [ ] 키보드만으로 조작을 끝낼 수 있고 44px 터치 대상이다.
- [ ] 360px·768px·1280px에서 레이아웃이 깨지지 않는다(같은 DOM).
- [ ] 라이트·다크 모두 대비가 통과한다.
- [ ] STDF로 대체 가능한 부분을 native로 재구현하지 않았다.

## 11. STDF 3.0.0 사용 범위 (export 67종 전수)

"STDF를 최대한 활용한다"는 것은 **요구를 충족하는 컴포넌트를 하나도 건너뛰지 않는다**는 뜻이지, 모든 컴포넌트를
억지로 쓰는 것이 아니다. 아래는 설치판 export 67종(`Feedback` 포함)을 전수로 분류한 결과다.

| 결과 | 수 | 의미 |
| --- | --- | --- |
| 사용 | 14 | 모든 화면의 상호작용이 이 컴포넌트들로 조립된다 |
| 계약이 부족해 대체 | 45 | STDF가 있으나 설치판 계약(§1.1)으로 요구를 충족하지 못해 같은 역할을 native로 구현 |
| 업무에 없음 | 8 | 기능 자체가 없음(점수 연출·평가·캐러셀·색인·이미지 갤러리 등) |

STDF 3.0.0은 **모바일 UI를 전제로 한 라이브러리**다. 링크·표·탭 의미·대화상자 포커스가 없어(§1.1) 이 데스크톱 우선 운영 콘솔에서는
"조작의 몸통"만 STDF로 받아 쓰는 것이 정직한 최대 활용이다. 어떤 항목을 그래도 쓰기로 결정하면 §11.3 절차로 다시 검토한다.

### 11.1 사용

| STDF | 사용처 | 옵션 |
| --- | --- | --- |
| `ConfigProvider` | 루트 레이아웃(ko_KR) | `locale` |
| `Button` | 모든 행동 | `fill`·`state`·`size="full｜auto"`·`heightIn`·`loading` |
| `Input` | 검색·제목·Riot ID 이름/태그·사유 | `title`·`state`·`tip`·`py`·`bind:value`·`onkeydown` |
| `Popup` | `TaskDialog`·서버 선택기·계정 메뉴 | `position`·`size`·`maskClosable`·`radius` |
| `Dialog` | `ConfirmDialog`(철회·권한 변경·파괴적 작업) | `title`·`content`·`primaryButton`·`secondaryButton` |
| `Card` | 팀 열·경매 후보·경기 카드(정적) | `border="solid"`·`radius`·`shadow="none"` |
| `Skeleton` | 최초 조회 | `type`·`width`·`height`·`space`·`effect` |
| `Loading` | 조건 변경·제출 표시 | `height`·`width`·`type` |
| `Progress` | `FillMeter`(정원·예산) | `percent`·`height`·`inactive` |
| `Pagination` | 경기·출전 목록 | `total`·`pageSize`·`current`·`maxShowPage`·`type` |
| `Badge` | 내전 목록의 신청 수·경매 레일의 잔여 자리 | `text`·`isShow`·`offsetY` |
| `Divider` | 문서 섹션·설정 그룹 구분 | `layout`·`py` |
| `Mask` | `TaskDialog` 밖의 드래그 차단(업로드 중) | `visible`·`opacity` |
| `Icon` | `ServiceIcon`의 인라인 경로 렌더 | children 스니펫 |

### 11.2 미사용 (이유 포함)

| STDF | 사용하지 않는 이유 | 대안 |
| --- | --- | --- |
| `Tag` | 항상 `role="button"`+`tabindex` → 표시용 라벨 불가 | `StatusTag`(native span) |
| `Tabs`·`Tab`·`TabContent` | tablist 역할·`aria-selected`·방향키 없음 | `<nav>`+`<a aria-current>` |
| `Accordion` | `aria-expanded` 없음, 접힌 내용이 DOM에서 제거 | `<details>` |
| `NavBar` | `<div>` 루트, sticky·`<header>`·다중 행 없음 | 자체 `<header>` + 레일 |
| `List`·`Cell`·`CellGroup` | 행이 `button`, `href` 없음 | `<ul>/<li>/<a>` |
| `Avatar`·`AvatarGroup` | 항상 `button`, 이미지 `alt=""`, 접근 가능한 이름 없음 | 정적 `<img alt="">` + 이름 텍스트 |
| `Radio`·`RadioItem`·`Checkbox`·`CheckboxItem`·`Switch` | `role`/`checked`/그룹 라벨 미보장 | `<fieldset>`+native |
| `Stepper` | 직접 입력·`aria` 없음 | `<input type="number">` |
| `Picker`·`AsyncPicker`·`TimePicker`·`Calendar` | 휠이 스크롤 div, 키보드 선택 없음 | native `select`·`datetime-local` |
| `ActionSheet`·`ActionPopover`·`BottomSheet` | Popup과 같은 a11y 공백 + 데스크톱/모바일 이중 조작 유발 | `TaskDialog`·인라인 편집 하나로 통일 |
| `Modal` | Dialog와 중복, 확인 중심 | `Dialog` |
| `Alert`·`Toast`·`Feedback` | 자동 소멸 알림은 지속 오류/결과에 부적합. 현재 토스트가 필요한 기능 없음 | 영역 내 상태 문장 |
| `Form` | `<form>`·검증·`name` 없음 | native `<form>` + `Field` |
| `Steps` | 진행 정보를 단계 그래픽으로 한 번 더 표현하는 중복이고 `aria-current="step"`도 없다 | `StatusTag` + `NowLine` |
| `Tooltip` | hover/focus 전용이고 열림 상태가 보장되지 않음. 필수 정보를 숨기는 데 쓸 수 없음 | 텍스트 라벨 |
| `NoticeBar` | 자동 스크롤(마퀴)·자동 닫힘 전용 목록 컴포넌트 | 지속 안내는 테두리 있는 문단 하나 |
| `CountDown` | 자동 카운트다운은 조작을 재촉하고 사용하지 않음 | 예정 시각 텍스트 |
| `CharRoll`·`Rate`·`Slider`·`Swiper`·`IndexBar`·`ProgressLoop` | 해당 업무 없음(점수 연출·평가·캐러셀·색인) | — |
| `InfiniteScroll`·`PullRefresh` | 모바일 제스처 전용 + ko_KR 문구 누락 | `AsyncSection`+`Pagination` |
| `NumKeyboard`·`FullKeyboard`·`CodeInput`·`ColorPicker`·`Signature` | 대응 입력 없음 | native 입력 |
| `ImagePreview`·`ImageList` | 사용자 이미지 업로드 기능 없음(`--radius-btn` 버그 포함) | — |
| `Grid`·`Grids` | Tailwind 그리드로 충분, 중첩 레이아웃 래퍼 불필요 | Tailwind |
| `TabBar` | 하단 탭은 헤더 레일과 목적지 중복 | 컨텍스트 레일(헤더) |
| `ButtonGroup` | `aria-pressed` 없음 → 필터에 부적합 | native radio(`ChoiceGroup`) |
| `Placeholder` | 빈 상태는 문장 하나로 충분 | `AsyncSection` 빈 상태 |

### 11.3 판정 규칙

새 UI가 필요해 이 표의 `미사용` 항목을 쓰고 싶다면 **먼저 §1.1 제약을 다시 확인**하고,
그래도 필요하면 "STDF 옵션으로 해결할 수 없는 의미·조작"을 근거로 이 표를 갱신한 뒤 도입한다.
근거 없는 재도입은 `pnpm check`로 막을 수 없으므로 리뷰에서 이 표를 기준으로 판단한다.
