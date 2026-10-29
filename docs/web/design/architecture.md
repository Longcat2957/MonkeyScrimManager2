# 코드 구조 — 셸·문맥·데이터·상태

작성일: 2026-10-29. 선행: [디자인 시스템](system.md) · 다음: [컴포넌트](components.md) · [페이지](pages.md)

이 문서는 새 프론트엔드가 **어떤 파일로, 어떤 계약으로, 어떤 상태 위에서** 조립되는지 확정한다.
컴포넌트의 상세 API는 [components.md](components.md), 화면별 조립은 [pages.md](pages.md)가 맡는다.

## 1. 확정 사항 (새로 정하는 것)

| # | 결정 | 근거 |
| --- | --- | --- |
| A1 | 셸은 **하나의 DOM**: 헤더 1개 + 컨텍스트 레일 1개 + 본문 + 푸터. 전역/서버/내전 헤더는 "헤더 컴포넌트 교체"가 아니라 **헤더 내부 내용의 교체**로 구현한다 | 중복 마크업 금지, 라이트·다크·모바일 3벌 관리 회피, [routing.md:99-101](../routing.md)의 "헤더 하나" 원칙 |
| A2 | 문맥은 **`page.data`로 전달**한다. 서버 레이아웃이 검증한 `guild`·`scrim`·`viewer`를 루트 레이아웃이 읽는다 | 페이지가 헤더에 데이터를 전달하는 유일한 단방향 경로 |
| A3 | 목 데이터는 `$lib/mocks`, 조회 계약은 `$lib/data`. 라우트만 데이터를 조회하고 컴포넌트는 props로만 받는다 | [AGENTS.md](../../../AGENTS.md) Frontend Mock Data |
| A4 | 화면 상태는 **URL > 서버 상태 > 컴포넌트 로컬 상태** 순으로 둔다. 필터·선택은 `?query`, 편집 중 초안만 로컬 | 뒤로가기·공유·복원 요구([page-requirements.md:126](../page-requirements.md)) |
| A5 | 비동기 영역은 **전부 `AsyncSection` 하나**로 감싸 로딩·빈·오류·재시도를 통일한다 | 현재 0개인 상태 구현을 강제 |
| A6 | 대화형 조작은 STDF 네이티브, **링크·표·상태 라벨·파일 선택만 native**. 예외는 [components.md §9](components.md#9-네이티브-예외-목록)에 등록된 것뿐 | STDF 우선 + 접근성 |
| A7 | 인증이 구현되기 전까지 `viewer`는 `null`이다. 헤더는 로그인·계정 영역을 **렌더하지 않는다**(작동하지 않는 버튼 금지) | [pages/global.md:38-41](../pages/global.md) |

## 2. 디렉터리 구조

```text
apps/web/src/
├── app.html                          # 테마 부트스트랩·메타 (system.md §9)
├── app.d.ts                          # App.PageData 보강
├── hooks.server.ts                   # 인증·문맥 로딩 자리(현재는 통과)
├── lib/
│   ├── branding.ts                   # SERVICE_NAME 등 (기존 유지)
│   ├── styles/
│   │   ├── tokens.css                # system.md §8.1
│   │   ├── base.css                  # system.md §8.2
│   │   └── utilities.css             # system.md §8.3
│   ├── shell/
│   │   ├── navigation.ts             # 전역·서버·내전 목적지 정의(단일 출처)
│   │   ├── context.ts                # GuildContext / ScrimContext / ViewerContext
│   │   ├── appearance.svelte.ts      # 화면 모드 상태(시스템 설정·저장)
│   │   └── titles.ts                 # 페이지 제목 형식
│   ├── data/
│   │   ├── index.ts                  # 조회 진입점(어댑터 선택)
│   │   ├── types.ts                  # 뷰 모델 계약
│   │   └── adapter.mocks.ts          # 지금 사용하는 구현
│   ├── mocks/
│   │   ├── guilds.ts                 # 길드·사용자 표본
│   │   ├── scrims.ts                 # 내전·참가자·편성
│   │   ├── records.ts                # 경기·Game·성적
│   │   ├── stats.ts                  # 서버 통계
│   │   ├── auction.ts                # 경매 상태·이력
│   │   ├── bracket.ts                # 라운드·대진
│   │   └── simulate.ts               # 지연·실패·빈 상태 주입
│   ├── components/
│   │   ├── shell/                    # AppHeader Outlet, ContextRail, GuildSwitcher, AccountMenu, AppearanceToggle, AppFooter, SkipLink, RouteFocus
│   │   ├── ui/                       # AsyncSection, DataTable, PageHeader, EmptyState, ErrorState, TaskDialog, ConfirmDialog, Field, StatusTag, FillMeter, MetricList, ServiceIcon, NowLine
│   │   ├── scrim/                    # ScrimBoard, ScrimRow, ScrimContextBar, RosterTable, RosterRow, RegistrationDialog, OperationsPanel, RegistrationHistory
│   │   ├── formation/                # TeamFormationBoard, TeamColumn, AssignmentEditor, AuctionConsole, AuctionLotCard, AuctionTeamRail, AuctionLog
│   │   ├── records/                  # MatchRow, SeriesScore, GameTabs, ScoreboardTable, PlayerGamePanel, FearlessStrip, RoflUploadDialog, MatchScopeBar
│   │   ├── player/                   # PlayerProfileHeader, PlayerStatBand, PositionMmrList, PlayerGameList
│   │   ├── stats/                    # StatSummary, BreakdownTable, ScopeSelect
│   │   ├── guild/                    # GuildPulse(서버 홈 상단 지표), AdminSettingsForm, GuildMemberList
│   │   └── document/                 # DocumentPage, TocNav
│   └── server/                       # 기존 Riot/ROFL/DB 코드 (변경 없음)
└── routes/
    ├── +layout.svelte                # 셸 조립
    ├── +layout.ts                    # viewer·길드 목록
    ├── +error.svelte                 # 403/404/5xx
    ├── layout.css                    # 진입점(import만)
    ├── +page.svelte
    ├── me/ docs/ terms/ privacy/ backoffice/
    ├── dev/components/               # 실제 컴포넌트 갤러리(시나리오 전환)
    ├── dev/error/
    └── g/[guildId]/
        ├── +layout.ts                # guild 문맥 검증
        ├── +layout.svelte            # (선택) 서버 레벨 공통 영역
        ├── +page.svelte
        ├── scrims/
        │   ├── +page.svelte
        │   └── [scrimId]/
        │       ├── +layout.ts        # scrim 문맥 검증
        │       ├── +page.svelte
        │       ├── teams/+page.svelte
        │       ├── teams/manual/+page.svelte
        │       ├── teams/auction/+page.svelte
        │       └── bracket/+page.svelte
        ├── matches/...
        ├── players/[userId]/...
        ├── stats/+page.svelte
        └── admin/+page.svelte
```

삭제 대상: `src/lib/components/layout/AppHeader.svelte`, `AppFooter.svelte`(→ `shell/`로 재작성), `.app-frame` 규칙,
`main`의 `app-frame` 클래스, 기존 `layout.css`의 색·테마 블록(tokens.css로 이동).

## 3. 문맥 계약

```ts
// src/lib/shell/context.ts
import type { FormationMethod, ScrimStatus } from '$lib/data/types';

export interface GuildOption {
	id: string;
	name: string;
	iconUrl: string | null;
}

/** 서버 헤더·서버 문서 제목이 쓰는 최소 문맥. 서버 레이아웃이 접근 권한을 확인한 뒤 전달한다. */
export interface GuildContext extends GuildOption {
	viewerRole: 'guest' | 'member' | 'admin';
}

/** 내전 헤더·내전 문서 제목이 쓰는 최소 문맥. 내전 레이아웃이 검증한 뒤 전달한다. */
export interface ScrimContext {
	id: string;
	guildId: string;
	title: string;
	status: ScrimStatus;
	formationMethod: FormationMethod | null;
	teamCount: number;
	expectedStartAt: string | null;
}

/** 로그인 사용자. 인증 구현 전에는 null이며 헤더가 계정 영역을 그리지 않는다. */
export interface ViewerContext {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	isServiceAdmin: boolean;
	guilds: GuildOption[];
}
```

```ts
// src/app.d.ts
declare global {
	namespace App {
		interface Locals {
			viewer: import('$lib/shell/context').ViewerContext | null;
		}
		interface PageData {
			viewer: import('$lib/shell/context').ViewerContext | null;
			guild: import('$lib/shell/context').GuildContext | null;
			scrim: import('$lib/shell/context').ScrimContext | null;
		}
		interface Error {
			/** 사용자가 읽을 한 문장. 없으면 상태 코드 기본 문구를 쓴다. */
			message: string;
			code?: 'guild_forbidden' | 'guild_not_found' | 'scrim_not_found';
		}
	}
}
```

규칙:

- 레이아웃은 자기 문맥 키만 채운다(`guild` 레이아웃은 `guild`, 내전 레이아웃은 `scrim`). 전체 객체를 복제하지 않는다.
- 페이지는 문맥 키를 만들지 않는다. 페이지가 헤더 정보를 바꿔야 하면 레이아웃의 데이터를 고친다.
- `guild`/`scrim`이 없는 라우트는 `null`. 루트 레이아웃은 `null`을 정상 상태로 취급한다(오류로 만들지 않는다).

## 4. 셸 조립

### 4.1. 루트 레이아웃

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import '../lib/styles/tokens.css';
	import '../lib/styles/base.css';
	import '../lib/styles/utilities.css';
	import { ConfigProvider } from 'stdf';
	import { ko_KR } from 'stdf/lang';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '$lib/branding';
	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import AppFooter from '$lib/components/shell/AppFooter.svelte';
	import SkipLink from '$lib/components/shell/SkipLink.svelte';
	import RouteFocus from '$lib/components/shell/RouteFocus.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// 길드·내전 레이아웃이 검증한 문맥이 있으면 헤더가 교체된다.
	const guild = $derived(page.data.guild ?? null);
	const scrim = $derived(page.data.scrim ?? null);
</script>

<ConfigProvider locale={ko_KR}>
	<SkipLink />
	<RouteFocus />
	<div class="flex min-h-dvh flex-col bg-surface-app text-fg">
		<AppHeader {guild} {scrim} viewer={page.data.viewer ?? null} />
		<!-- 레일은 헤더 내부에서 스크롤 시 함께 붙는다. main은 focus 이동 대상이다. -->
		<main id="main-content" tabindex="-1" class="flex-1 pb-16 focus:outline-none">
			{@render children()}
		</main>
		<AppFooter />
	</div>
</ConfigProvider>
```

- `<svelte:head>`의 `application-name`·기본 제목은 `+layout.ts`나 `app.html`에서 한 번만 둔다. 페이지는 `titles.ts`로 제목만 덮는다.
- `ConfigProvider`는 여기 한 번만. STDF 기본 문구(페이지 이동 이름, 입력 지우기 등)가 한국어로 나온다.
  언어는 Svelte context로만 전달되므로 **모든 STDF 소비 하위 트리가 이 안에 있어야** 한다.
- 전역 알림(토스트)을 쓰기로 한 기능이 생기면 `<Feedback />`를 **`ConfigProvider` 안에** 하나만 둔다.
  현재는 영역 안 피드백을 기본으로 하고 토스트를 쓰지 않는다(§7.2).

### 4.2. 헤더가 문맥을 고르는 방법

```svelte
<!-- src/lib/components/shell/AppHeader.svelte (요지) -->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { SERVICE_NAME } from '$lib/branding';
	import { globalDestinations, guildDestinations, scrimDestinations } from '$lib/shell/navigation';
	import GuildSwitcher from './GuildSwitcher.svelte';
	import AccountMenu from './AccountMenu.svelte';
	import AppearanceToggle from './AppearanceToggle.svelte';
	import ContextRail from './ContextRail.svelte';
	import type { GuildContext, ScrimContext, ViewerContext } from '$lib/shell/context';

	let {
		guild = null,
		scrim = null,
		viewer = null
	}: { guild: GuildContext | null; scrim: ScrimContext | null; viewer: ViewerContext | null } = $props();

	// 현재 경로에서 어떤 목적지가 활성인지 한 곳에서 계산한다.
	const pathname = $derived(page.url.pathname);
	const destinations = $derived(
		scrim && guild
			? scrimDestinations(guild.id, scrim)
			: guild
				? guildDestinations(guild)
				: globalDestinations()
	);
	// 내전 문맥에서 서버 홈으로 돌아가는 경로는 서버 선택기 안에만 둔다(레이에서는 제거).
	const railLabel = $derived(scrim ? '내전' : guild ? '서버' : null);
</script>

<header class="sticky top-0 z-40 border-b border-line bg-surface-app/95 backdrop-blur-sm">
	<div class="shell flex h-(--app-header-height) items-center gap-3">
		<a href={resolve('/')} class="flex items-center gap-2" aria-label={`${SERVICE_NAME} 홈`}>
			<img src="/brand/logo.png" alt="" width="28" height="28" class="size-7" />
			<span class="font-brand hidden text-2xl leading-none sm:block">{SERVICE_NAME}</span>
		</a>
		{#if scrim && guild}
			<span class="text-faint" aria-hidden="true">/</span>
			<GuildSwitcher {guild} {viewer} mode="context" scrimTitle={scrim.title} />
		{:else if viewer}
			<GuildSwitcher {guild} {viewer} mode="select" />
		{/if}
		<!-- 로그인 전에는 서버 목록을 알 수 없으므로 선택기를 그리지 않는다(작동하지 않는 조작 금지). -->
		<div class="ml-auto flex items-center gap-1">
			<AppearanceToggle />
			{#if viewer}<AccountMenu {viewer} />{/if}
		</div>
	</div>
	{#if railLabel}
		<ContextRail {destinations} label={railLabel} current={pathname} />
	{/if}
</header>
```

- 헤더는 **고정 높이**이고 밑의 레일도 같은 `<header>` 안에 있어 하나만 sticky다(헤더 두 줄이 서로 겹치지 않는다).
- 모바일에서도 같은 DOM이다. 레일은 `overflow-x: auto` + 스크롤 스냅. 메뉴 버튼으로 목적지를 복제하지 않는다.
- 서버·내전 문맥이 없는 페이지는 `GuildSwitcher mode="select"`, 있는 페이지는 `mode="context"`다.

### 4.3. 목적지 정의 (단일 출처)

```ts
// src/lib/shell/navigation.ts
import { resolve } from '$app/paths';
import type { GuildContext, ScrimContext } from './context';

export interface Destination {
	label: string;
	href: string;
	/** 활성 판정에 쓰는 경로 접두사. 가장 길게 일치하는 항목만 활성화한다. */
	match: string;
	exact?: boolean;
}

export const globalDestinations = (): Destination[] => [];

export const guildDestinations = (guild: GuildContext): Destination[] => [
	{ label: '서버 홈', href: resolve('/g/[guildId]', { guildId: guild.id }), match: `/g/${guild.id}`, exact: true },
	{ label: '내전', href: resolve('/g/[guildId]/scrims', { guildId: guild.id }), match: `/g/${guild.id}/scrims` },
	{ label: '경기 기록', href: resolve('/g/[guildId]/matches', { guildId: guild.id }), match: `/g/${guild.id}/matches` },
	{ label: '통계', href: resolve('/g/[guildId]/stats', { guildId: guild.id }), match: `/g/${guild.id}/stats` },
	// 관리 항목은 권한이 있을 때만 배열에 넣는다(비활성 링크를 만들지 않는다).
	...(guild.viewerRole === 'admin'
		? [{ label: '관리', href: resolve('/g/[guildId]/admin', { guildId: guild.id }), match: `/g/${guild.id}/admin` }]
		: [])
];

export const scrimDestinations = (guildId: string, scrim: ScrimContext): Destination[] => [
	{ label: '요약', href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: scrim.id }), match: `/g/${guildId}/scrims/${scrim.id}`, exact: true },
	{ label: '팀 편성', href: resolve('/g/[guildId]/scrims/[scrimId]/teams', { guildId, scrimId: scrim.id }), match: `/g/${guildId}/scrims/${scrim.id}/teams` },
	{ label: '대진', href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', { guildId, scrimId: scrim.id }), match: `/g/${guildId}/scrims/${scrim.id}/bracket` }
];
```

활성 판정은 `ContextRail`이 한다: `exact`면 동등, 아니면 가장 긴 `match` 접두사를 가진 항목 하나만 활성.

### 4.4. 서버 선택기

| 항목 | 규칙 |
| --- | --- |
| 트리거 | STDF `Button fill="line" size="sm"` + 서버 아이콘·이름(모바일은 아이콘+이름 축약) |
| 패널 | STDF `Popup position="bottom"` — 모바일에서 화면 하단 시트로 자연스럽게 붙는다 |
| 내용 | 현재 서버(표시 전용, 링크 아님) → 다른 서버 링크 목록 → 내전 문맥이면 `서버 홈` 링크 1개 |
| 상태 | 서버 목록 로딩(`Skeleton` 2줄), 목록 없음(한 문장), 조회 실패(문장 + 재시도 `Button`) |
| 금지 | 본문에 두 번째 서버 선택, 서버 목록 페이지 추가 |

## 5. 레이아웃과 데이터 로딩

### 5.1. 서버 문맥

```ts
// src/routes/g/[guildId]/+layout.ts
import { error } from '@sveltejs/kit';
import { getGuildContext } from '$lib/data';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ params, parent }) => {
	const { viewer } = await parent();
	const guild = await getGuildContext(params.guildId, viewer);
	// 서버 레이아웃이 접근 권한·존재 여부를 확인한 뒤 문맥을 만든다.
	if (guild === 'forbidden') error(403, { message: '이 서버를 볼 권한이 없습니다.' });
	if (guild === 'missing') error(404, { message: '서버를 찾을 수 없습니다.' });
	return { guild };
};
```

### 5.2. 내전 문맥

```ts
// src/routes/g/[guildId]/scrims/[scrimId]/+layout.ts
import { error } from '@sveltejs/kit';
import { getScrimContext } from '$lib/data';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ params, parent }) => {
	const { guild } = await parent();
	const scrim = await getScrimContext(guild.id, params.scrimId);
	if (scrim === 'missing') error(404, { message: '내전을 찾을 수 없습니다.' });
	return { scrim };
};
```

- 문맥 조회는 가볍게 유지한다(제목·상태·편성 방식·정원). 상세 데이터는 페이지가 자기 책임으로 조회한다.
- 내전 레이아웃은 **헤더용 문맥만** 만든다. 제목·상태·시간을 본문 상단에 다시 쓰지 않는다
  (본문의 `ScrimContextBar`는 부가 정보(정원·피어리스·생성자)만 담는다 — [pages.md](pages.md) 참조).
- 서버 → 내전 이동 시 `guild`는 부모 레이아웃이 이미 로드했으므로 재조회하지 않는다.

### 5.3. 라우트 · 제목 · 헤더 표

| 라우트 | 문맥 | 문서 제목 | 데이터 출처 |
| --- | --- | --- | --- |
| `/` | 전역 | `Monkeybot` | 정적 |
| `/me` | 전역 | `내 정보 · Monkeybot` | `getViewerProfile()` |
| `/docs`, `/terms`, `/privacy` | 전역 | `문서 · Monkeybot` 등 | 정적 |
| `/backoffice` | 전역 | `백오피스 · Monkeybot` | `getBackofficeSummary()` |
| `/g/[guildId]` | 서버 | `{서버명} · Monkeybot` | `getGuildHome()` |
| `/g/.../scrims` | 서버 | `내전 · {서버명} · Monkeybot` | `listScrims()` |
| `/g/.../scrims/[scrimId]` | 내전 | `{내전명} · {서버명} · Monkeybot` | `getScrimDetail()` |
| `.../teams` | 내전 | `팀 편성 · {내전명} · …` | `getFormationEntry()` |
| `.../teams/manual` | 내전 | `엔트리 편성 · …` | `getManualFormation()` |
| `.../teams/auction` | 내전 | `경매 팀 편성 · …` | `getAuctionState()` |
| `.../bracket` | 내전 | `대진 · …` | `getBracket()` |
| `/g/.../matches` | 서버 | `경기 기록 · {서버명} · Monkeybot` | `listMatches()` |
| `/g/.../matches/[matchId]` | 서버 | `{팀A} vs {팀B} · …` | `getMatchDetail()` |
| `/g/.../players/[userId]` | 서버 | `{이름} 전적 · {서버명} · …` | `getPlayerProfile()` |
| `/g/.../stats` | 서버 | `통계 · {서버명} · …` | `getGuildStats()` |
| `/g/.../admin` | 서버 | `관리 · {서버명} · …` | `getGuildAdmin()` |
| `/dev/components` | 전역 | `컴포넌트 갤러리 · …` | 목 데이터 고정 |

`titles.ts`에 형식 함수를 두고 각 페이지는 `pageTitle(['내전', guild?.name])`처럼 값을 넘긴다.
브라우저 제목과 헤더 레일 문구는 같은 용어(서버 홈/내전/경기 기록/통계/관리)를 쓴다.

## 6. 데이터 계층

### 6.1. 계약

```ts
// src/lib/data/types.ts (발췌)
export type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
export type ScrimStatus =
	| 'recruit' | 'preparing' | 'ready' | 'in_progress' | 'completed' | 'ended_early' | 'cancelled';
export type FormationMethod = 'manual' | 'auction';
export type RegistrationStatus = 'pending' | 'selected' | 'standby' | 'withdrawn' | 'excluded';
export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'ended_early' | 'cancelled';
export type GameStatus = 'pending' | 'in_progress' | 'awaiting_result' | 'completed' | 'cancelled';
export type GameSide = 'blue' | 'red';
export type AuctionStatus = 'setup' | 'in_progress' | 'completed' | 'cancelled';
export type LotStatus = 'open' | 'sold' | 'unsold' | 'cancelled';

export interface PlayerRef {
	userId: string | null;      // 사용자 연결이 사라진 기록은 null
	displayName: string;        // 기록 당시 이름
	riotId: string | null;      // 공개 범위 통과 후 값
}

export interface ScrimSummary {
	id: string;
	title: string;
	status: ScrimStatus;
	formationMethod: FormationMethod | null;
	teamCount: number;
	playingCapacity: number;    // teamCount × 5
	appliedCapacity: number;    // playingCapacity + reserveCapacity
	applicantCount: number;
	selectedCount: number;
	expectedStartAt: string | null;
	isHardFearless: boolean;
}

export interface Registration {
	participantId: string;
	player: PlayerRef;
	status: RegistrationStatus;
	positions: Position[];      // 희망 포지션(우선순위 순)
	joinedAt: string;
	teamId: string | null;
	teamPosition: Position | null;
}
```

전체 타입 목록은 구현 시 `types.ts`에 둔다. **DB 스키마를 그대로 노출하지 않는다**: 화면에 필요한 값만 담고,
누락(예: 연결되지 않은 참가)을 `null`로 표현할 수 있게 한다([rofl-import.md](../../rofl-import.md)의 누락 정의와 동일한 원칙).

### 6.2. 진입점

```ts
// src/lib/data/index.ts
// 화면은 이 파일의 함수만 호출한다. 목/실서비스 전환은 여기서만 일어난다.
export * from './types';
export {
	getViewerProfile, getGuildContext, getScrimContext, getGuildHome,
	listScrims, getScrimDetail, getFormationEntry, getManualFormation,
	getAuctionState, getBracket, listMatches, getMatchDetail,
	getPlayerProfile, getGuildStats, getGuildAdmin, getBackofficeSummary
} from './adapter.mocks';
```

각 함수는 `Promise`를 반환하고, 실패는 **throw 대신 판별 값**으로 돌려준다(`'missing' | 'forbidden'`).
조회 자체의 예외(네트워크·서버 오류)만 `throw`하고 `AsyncSection`이 잡아 재시도를 제공한다.

### 6.3. 목 어댑터와 시뮬레이션

```ts
// src/lib/mocks/simulate.ts
export type Scenario = 'normal' | 'empty' | 'slow' | 'error' | 'partial';

// 개발 화면에서 ?scenario=... 로 상태를 강제한다. 운영 모드에서는 무시한다.
export function currentScenario(url: URL): Scenario {
	const raw = url.searchParams.get('scenario');
	return raw === 'empty' || raw === 'slow' || raw === 'error' || raw === 'partial' ? raw : 'normal';
}

export async function simulate<T>(scenario: Scenario, value: T, empty: T): Promise<T> {
	if (scenario === 'slow') await new Promise((r) => setTimeout(r, 1500));
	if (scenario === 'error') throw new Error('목 조회 실패');
	return scenario === 'empty' ? empty : value;
}
```

- `adapter.mocks.ts`의 모든 함수는 `currentScenario`를 받지 않는다. 시나리오는 **라우트 로더**가
  `?scenario`를 읽어 `simulate()`로 감싼다(컴포넌트는 시나리오를 모른다).
- 목 표본은 실존 인물·실제 Riot ID를 쓰지 않는다. 이름은 `참가자 01`… 형식, 챔피언은 Data Dragon 이름을 쓴다.
- 시간은 고정 기준일(`2026-10-29T20:00:00+09:00`)로 만들고 상대 표시는 `Intl.DateTimeFormat('ko-KR')`로 계산한다.

## 7. 상태 처리 규격

### 7.1. 화면 상태의 세 종류

| 상태 | 위치 | 예 |
| --- | --- | --- |
| URL 상태 | `?q`, `?status`, `?page`, `?game`, `?scenario` | 경기 검색, Game 선택 |
| 서버 상태 | `load`가 돌려준 데이터 | 내전 목록, 성적 |
| 로컬 초안 | 컴포넌트 `$state` | 모집 생성 폼, 팀 배정 편집, 경매 가격 입력 |

URL 상태는 `goto()`로 갱신하고, 초안은 성공 응답 뒤 서버 상태로 대체한다. **초안을 URL에 넣지 않는다.**

### 7.2. 비동기 영역 하나로 통일

```svelte
<!-- src/lib/components/ui/AsyncSection.svelte (요지) -->
<script lang="ts">
	import { Skeleton, Button, Loading } from 'stdf';
	import type { Snippet } from 'svelte';

	let {
		state,             // 'loading' | 'error' | 'empty' | 'ready'
		emptyText,
		errorText = '불러오지 못했어요.',
		onretry,
		label,             // 스크린리더용 영역 이름: '내전 목록'
		loadingLines = 3,
		children
	}: {
		state: 'loading' | 'error' | 'empty' | 'ready';
		emptyText: string;
		errorText?: string;
		onretry?: () => void;
		label: string;
		loadingLines?: number;
		children: Snippet;
	} = $props();
</script>

<section aria-label={label} aria-busy={state === 'loading'}>
	{#if state === 'loading'}
		<div class="space-y-2" aria-hidden="true">
			{#each Array.from({ length: loadingLines }) as _, i (i)}
				<Skeleton type="p" width="full" height="4" />
			{/each}
		</div>
		<p class="sr-only" role="status">불러오는 중</p>
	{:else if state === 'error'}
		<div class="rounded-[var(--radius-box)] border border-line p-4">
			<p class="text-body-s text-muted">{errorText}</p>
			{#if onretry}
				<Button size="sm" fill="line" onclick={onretry}>다시 시도</Button>
			{/if}
		</div>
	{:else if state === 'empty'}
		<p class="text-body-s text-muted">{emptyText}</p>
	{:else}
		{@render children()}
	{/if}
</section>
```

- 조건 변경(검색·필터) 중에는 이전 결과를 숨기지 않고 제목 옆에 STDF `Loading`을 붙인다.
- 성공·실패 피드백은 **해당 작업 위치**에 남긴다. 토스트는 되돌릴 수 없는 전역 알림(예: 링크 복사)에만 쓴다.

### 7.3. 폼 규격

| 규칙 | 구현 |
| --- | --- |
| 라벨 | STDF `Input`의 `title`, 또는 native 입력에 `<label for>` |
| 오류 | 입력 아래에 텍스트 + `aria-describedby`, 첫 오류로 포커스 이동 |
| 제출 | 화면당 하나, `disabled={pending}` + `loading` |
| 초안 보존 | 실패 시 입력값 유지, 응답 확정 전 완료 표시 금지 |
| 한글 조합 | Enter 제출은 `event.isComposing`일 때 무시 |
| 취소 | 패널 하단 한 곳(제목의 X를 따로 두지 않는다) |

## 8. 접근성 인프라

| 요소 | 구현 위치 | 동작 |
| --- | --- | --- |
| 건너뛰기 링크 | `shell/SkipLink.svelte` | 첫 포커스 대상, `#main-content`로 이동 |
| 경로 변경 알림 | `shell/RouteFocus.svelte` | `afterNavigate`에서 `main`에 포커스(이동), `document.title` 갱신은 SvelteKit |
| 대화상자 포커스 | `ui/TaskDialog.svelte` | 열기: 첫 입력 포커스, Tab 순환, Escape 닫기, 배경 `inert`, 닫은 뒤 트리거 복귀 |
| 상태 알림 | `AsyncSection`, 폼 결과 | `role="status"`/`aria-live="polite"` 한 곳 |
| 아이콘 버튼 | `ServiceIcon` 사용처 | `aria-label` 필수, 44px 터치 영역 |
| 키보드 작업 | 경매·편성 | 드래그 전용 조작 금지. 선택→적용 2단계 메뉴 |

```ts
// src/lib/components/ui/focus.ts — 공용 포커스 유틸(액션 아님, 함수형)
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => el.offsetParent !== null || el === document.activeElement
	);
}
```

## 9. 코드 규칙

| 항목 | 규칙 |
| --- | --- |
| 컴포넌트 | `PascalCase.svelte`, 한 파일 한 책임, 화면 조립은 페이지가 한다 |
| props | `$props()` + 인라인 타입. 데이터는 `data...`, 콜백은 `on...`(`onassign`, `onsubmit`) |
| 상태 | `$state`/`$derived` 우선. 스토어는 화면 모드·알림처럼 전역에서만(`*.svelte.ts`) |
| 이벤트 | `onclick` 등 Svelte 5 속성 사용. `createEventDispatcher` 금지 |
| 스타일 | Tailwind 유틸 + 의미 토큰. 컴포넌트 전용 선택자는 `<style>`에 최소한만 |
| 주석 | 한국어로 "왜"를 적는다. 자명한 코드에 주석을 달지 않는다 |
| 타입 | `any` 금지. 외부 데이터는 `unknown` → 좁히기 |
| 접근 | 컴포넌트는 API·목을 직접 부르지 않는다. 라우트만 `$lib/data`를 호출한다 |
| 중복 | 같은 목적지 링크·같은 설명을 두 곳에 두지 않는다. 새 UI는 "사용자가 추가로 하는 판단"이 있을 때만 |

## 10. 오류 처리

```ts
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import { getViewer } from '$lib/data';

export const load: LayoutLoad = async ({ url }) => {
	// 인증 전에는 null. 개발 중에는 목 사용자로 헤더·페이지를 검증할 수 있다.
	return { viewer: await getViewer(url) };
};
```

- 레이아웃의 `error(403)`, `error(404)`는 `+error.svelte`가 받는다. 오류 화면은 **문맥을 모른 채**도 읽히게 만든다.
- 오류 화면 동작: 403 → "요청 권한" 안내 + 헤더의 서버 선택기 사용 안내(버튼 없음), 404 → 서버 홈으로 가는 링크 1개,
  5xx → `다시 시도` 버튼 1개. 각 상태에 동작은 1개만 둔다.
- 페이지 내부 조회 실패는 `+error`로 던지지 않고 `AsyncSection`의 오류 상태로 처리한다.

## 11. 검증 규약

| 시점 | 명령/절차 |
| --- | --- |
| 커밋 전 | `pnpm check`(브랜딩 + svelte-check) |
| 빌드 | `pnpm --filter @msm2/web build` |
| 화면 확인 | `/dev/components`에서 정상·로딩·빈·오류·비활성 5상태, 360/768/1280 폭, 라이트·다크 |
| 접근성 | 키보드만으로 각 업무 1회 수행, 스크린리더로 heading·표·폼 라벨 확인 |
| 중복 점검 | 화면 전체(헤더·본문·푸터·열린 패널)에서 같은 목적지·같은 문장 검색 |
