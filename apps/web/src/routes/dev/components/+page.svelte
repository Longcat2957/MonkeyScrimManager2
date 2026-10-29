<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		Badge,
		Button,
		Card,
		Dialog,
		Divider,
		Input,
		Loading,
		Pagination,
		Popup,
		Progress,
		Skeleton
	} from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import AppHeader from '#lib/components/shell/AppHeader.svelte';
	import AsyncSection from '#lib/components/ui/AsyncSection.svelte';
	import ChoiceGroup from '#lib/components/ui/ChoiceGroup.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import DataTable from '#lib/components/ui/DataTable.svelte';
	import FillMeter from '#lib/components/ui/FillMeter.svelte';
	import MetricList from '#lib/components/ui/MetricList.svelte';
	import NativeField from '#lib/components/ui/NativeField.svelte';
	import StatusTag from '#lib/components/ui/StatusTag.svelte';
	import TaskDialog from '#lib/components/ui/TaskDialog.svelte';
	import { MATCH_STATUS, POSITION_LABEL, SCRIM_STATUS } from '#lib/components/ui/status.ts';
	import type { Loadable } from '#lib/data/types.ts';
	import type { GuildContext, ScrimContext, ViewerContext } from '#lib/shell/context.ts';

	type Scenario = 'normal' | 'empty' | 'slow' | 'error' | 'partial';

	const SCENARIOS: { value: Scenario; label: string }[] = [
		{ value: 'normal', label: '정상' },
		{ value: 'empty', label: '빈 데이터' },
		{ value: 'slow', label: '로딩' },
		{ value: 'error', label: '오류' },
		{ value: 'partial', label: '부분 누락' }
	];

	const scenario = $derived((page.url.searchParams.get('scenario') ?? 'normal') as Scenario);

	function setScenario(value: Scenario) {
		const url = new URL(String(page.url));
		url.searchParams.set('scenario', value);
		// 시나리오 전환은 화면 상태만 바꾸므로 다시 로드하지 않고 URL만 갱신한다.
		goto(url, { replace: true, shallow: true, reset: false });
	}

	let dialogOpen = $state(false);
	let popupOpen = $state(false);
	let taskOpen = $state(false);
	let confirmOpen = $state(false);
	let busy = $state(false);
	let demoChoices = $state<'all' | 'recruit'>('all');

	function runBusyDemo() {
		busy = true;
		setTimeout(() => (busy = false), 1200);
	}

	// 헤더 변형을 확인하기 위한 목 문맥이다. 실제 데이터가 아니다.
	const demoGuild: GuildContext = {
		id: 'demo-guild',
		name: '모의 서버',
		iconUrl: null,
		viewerRole: 'admin'
	};
	const demoScrim: ScrimContext = {
		id: 'demo-scrim',
		guildId: demoGuild.id,
		title: '30일 밤 내전 #12',
		status: 'preparing',
		formationMethod: 'auction',
		teamCount: 2,
		expectedStartAt: '2026-10-29T20:00:00+09:00'
	};
	const demoViewer: ViewerContext = {
		id: 'demo-viewer',
		displayName: '모의 사용자',
		avatarUrl: null,
		isServiceAdmin: false,
		guilds: [demoGuild]
	};

	// 비동기 영역 표시를 시나리오에 맞춰 바꾼다.
	const demoResult: Loadable<string[]> = $derived(
		scenario === 'error'
			? { status: 'error', message: '불러오지 못했어요.' }
			: scenario === 'empty'
				? { status: 'ready', data: [] }
				: { status: 'ready', data: ['참가자 01', '참가자 02'] }
	);

	const demoRoster = [
		{ name: '참가자 01', position: 'top' as const, status: SCRIM_STATUS.recruit },
		{ name: '참가자 02', position: 'jungle' as const, status: SCRIM_STATUS.preparing },
		{ name: '참가자 03', position: 'mid' as const, status: SCRIM_STATUS.completed }
	];

	const brandColors = [
		{ name: 'ink-900', value: 'var(--color-ink-900)' },
		{ name: 'ink-800', value: 'var(--color-ink-800)' },
		{ name: 'cream-50', value: 'var(--color-cream-50)' },
		{ name: 'cream-200', value: 'var(--color-cream-200)' },
		{ name: 'signal-500', value: 'var(--color-signal-500)' },
		{ name: 'signal-700', value: 'var(--color-signal-700)' }
	];

	const semanticColors = [
		{ name: 'surface-card', value: 'var(--surface-card)' },
		{ name: 'surface-sunken', value: 'var(--surface-sunken)' },
		{ name: 'line', value: 'var(--line)' },
		{ name: 'action', value: 'var(--action-bg)' },
		{ name: 'success', value: 'var(--success)' },
		{ name: 'warning', value: 'var(--warning)' },
		{ name: 'danger', value: 'var(--danger)' },
		{ name: 'side-a', value: 'var(--side-a)' },
		{ name: 'side-b', value: 'var(--side-b)' }
	];
</script>

<svelte:head>
	<title>컴포넌트 갤러리 | {SERVICE_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="px-1 py-8">
	<p class="category-label">디자인 검토</p>
	<h1 class="mt-1 text-title-xl">컴포넌트 갤러리</h1>
	<p class="measure mt-2 text-body-s text-muted">
		디자인 회귀의 기준 화면이다. 라이트·다크, 360px·768px·1280px에서 같은 항목을 확인한다.
	</p>

	<!-- 시나리오 전환: 정상·빈·로딩·오류·부분 누락 -->
	<fieldset class="mt-6">
		<legend class="text-body-s font-semibold">상태 시나리오</legend>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each SCENARIOS as item (item.value)}
				<label
					class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-3 text-body-s {scenario ===
					item.value
						? 'border-action bg-surface-raised font-semibold'
						: 'border-line text-muted'}"
				>
					<input
						type="radio"
						name="scenario"
						value={item.value}
						checked={scenario === item.value}
						onchange={() => setScenario(item.value)}
						class="size-4 accent-[var(--action-bg)]"
					/>
					{item.label}
				</label>
			{/each}
		</div>
	</fieldset>

	<!-- 색 -->
	<section class="mt-10" aria-labelledby="colors">
		<h2 id="colors" class="text-title-l">색</h2>
		<div class="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
			{#each brandColors as color (color.name)}
				<div>
					<div class="h-12 rounded-sm border border-line" style:background={color.value}></div>
					<p class="mt-1 text-caption text-muted">{color.name}</p>
				</div>
			{/each}
		</div>
		<div class="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
			{#each semanticColors as color (color.name)}
				<div>
					<div class="h-12 rounded-sm border border-line" style:background={color.value}></div>
					<p class="mt-1 text-caption text-muted">{color.name}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- 타입 -->
	<section class="mt-10" aria-labelledby="type">
		<h2 id="type" class="text-title-l">타입</h2>
		<div class="mt-3 space-y-3 border-t border-line pt-3">
			<p class="numeric-display text-display-xl">2 : 1</p>
			<p class="text-display-l">라운드 2</p>
			<p class="text-title-xl">시리즈 점수</p>
			<p class="text-title-l">참가자 명단</p>
			<p class="text-title-m">30일 밤 내전 #12</p>
			<p class="text-body">본문 15px. 내전 모집과 참가 현황을 한 화면에서 확인합니다.</p>
			<p class="text-body-s">표 셀 14px. <span class="tabular">1&thinsp;500</span> · <span class="tabular">KDA 3.42</span></p>
			<p class="category-label">구역 라벨</p>
		</div>
	</section>

	<!-- 버튼 -->
	<section class="mt-10" aria-labelledby="buttons">
		<h2 id="buttons" class="text-title-l">버튼</h2>
		<div class="mt-3 space-y-4 border-t border-line pt-4">
			<div class="flex flex-wrap items-center gap-2">
				<Button size="auto" injClass="px-4" fill="base" state="theme">주 행동</Button>
				<Button size="auto" injClass="px-4" fill="line">보조</Button>
				<Button size="auto" injClass="px-4" fill="text">글자</Button>
				<Button size="auto" injClass="px-4" fill="line" state="error">철회</Button>
				<Button size="auto" injClass="px-4" fill="base" state="theme" loading={busy ? { height: '4', width: '4' } : null} onclick={runBusyDemo}>
					{busy ? '처리 중' : '처리 실행'}
				</Button>
				<Button size="auto" injClass="px-4" disabled>비활성</Button>
			</div>
			<div class="grid max-w-md gap-2">
				<Button size="full" fill="base" state="theme">폼 제출(전체 폭)</Button>
			</div>
		</div>
	</section>

	<!-- 입력 -->
	<section class="mt-10" aria-labelledby="inputs">
		<h2 id="inputs" class="text-title-l">입력</h2>
		<div class="mt-3 grid max-w-2xl gap-4 border-t border-line pt-4">
			<Input title="내전 제목" placeholder="예: 30일 밤 내전" py="2" />
			<Input title="검색" placeholder="팀명으로 검색" type="search" py="2" />
			<Input title="Riot ID" value="hide on bush" state="error" tip="계정을 찾을 수 없습니다." py="2" />
			<div class="grid gap-1">
				<label for="demo-select" class="text-body-s font-semibold">편성 방식</label>
				<select
					id="demo-select"
					class="min-h-11 rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
				>
					<option>엔트리 편성</option>
					<option>경매 편성</option>
				</select>
				<p class="text-caption text-muted">STDF Picker는 키보드 선택을 보장하지 않아 native select를 쓴다.</p>
			</div>
		</div>
	</section>

	<!-- 상태 -->
	<section class="mt-10" aria-labelledby="states">
		<h2 id="states" class="text-title-l">상태</h2>
		<p class="mt-1 text-body-s text-muted">현재 시나리오: <strong>{scenario}</strong></p>
		<div class="mt-3 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
			{#if scenario === 'slow'}
				<div class="space-y-2">
					{#each [1, 2, 3] as line (line)}
						<Skeleton type="p" width="full" height="4" />
					{/each}
					<p class="sr-only" role="status">불러오는 중</p>
				</div>
			{:else if scenario === 'empty'}
				<p class="text-body-s text-muted">아직 등록된 경기가 없습니다.</p>
			{:else if scenario === 'error'}
				<div class="space-y-2 rounded-sm border border-line p-3">
					<p class="text-body-s text-muted">불러오지 못했어요.</p>
					<Button size="auto" injClass="px-3" fill="line">다시 시도</Button>
				</div>
			{:else if scenario === 'partial'}
				<div class="space-y-1 text-body-s">
					<p>참가자 01 · 미드 · 선발</p>
					<p class="text-muted">참가자 02 · 포지션 미확인</p>
				</div>
			{:else}
				<div class="space-y-1 text-body-s">
					<p>참가자 01 · 미드 · 선발</p>
					<p>참가자 02 · 정글 · 선발</p>
				</div>
			{/if}
			<div class="flex items-center gap-4">
				<Loading height="6" width="6" />
				<div class="w-full">
					<Progress percent={70} height="2" />
				</div>
			</div>
		</div>
	</section>

	<!-- 표면 -->
	<section class="mt-10" aria-labelledby="surfaces">
		<h2 id="surfaces" class="text-title-l">표면·배지</h2>
		<div class="mt-3 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
			<Card border="solid" borderWidth="1" shadow="none" p="4" bg="surface">
				{#snippet header()}
					<div class="flex items-center justify-between">
						<span class="text-title-m">팀 A</span>
						<Badge text="4/5" isShow />
					</div>
				{/snippet}
				<p class="text-body-s text-muted">업무 단위 카드. 내부에 링크·버튼이 있으면 눌리는 카드로 만들지 않는다.</p>
			</Card>
			<div class="space-y-3">
				<div class="flex flex-wrap items-center gap-2 text-body-s">
					<span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption" style:border-color="color-mix(in oklab, var(--info) 35%, transparent)" style:color="var(--info)">
						<span class="size-1.5 rounded-full" style:background="var(--info)" aria-hidden="true"></span>모집 중
					</span>
					<span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption" style:border-color="color-mix(in oklab, var(--success) 35%, transparent)" style:color="var(--success)">
						<span class="size-1.5 rounded-full" style:background="var(--success)" aria-hidden="true"></span>선발
					</span>
					<span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption" style:border-color="color-mix(in oklab, var(--warning) 35%, transparent)" style:color="var(--warning)">
						<span class="size-1.5 rounded-full" style:background="var(--warning)" aria-hidden="true"></span>대기
					</span>
				</div>
				<p class="text-caption text-muted">상태 라벨은 native span이다. STDF Tag는 role="button"이라 표 행마다 포커스가 생긴다.</p>
				<Divider />
				<Pagination total={42} pageSize={20} current={1} maxShowPage={5} />
			</div>
		</div>
	</section>

	<!-- 오버레이 -->
	<section class="mt-10" aria-labelledby="overlays">
		<h2 id="overlays" class="text-title-l">오버레이</h2>
		<p class="mt-1 text-body-s text-muted">
			설치판 Popup에는 포커스 트랩·Escape·dialog 의미가 없다. 실제 입력 패널은 P1의 TaskDialog가 보완한다.
		</p>
		<div class="mt-3 flex flex-wrap gap-2 border-t border-line pt-4">
			<Button size="auto" injClass="px-4" fill="line" onclick={() => dialogOpen = true}>확인 다이얼로그</Button>
			<Button size="auto" injClass="px-4" fill="line" onclick={() => popupOpen = true}>팝업</Button>
			<Button size="auto" injClass="px-4" fill="base" state="theme" onclick={() => taskOpen = true}>입력 패널</Button>
			<Button size="auto" injClass="px-4" fill="line" state="error" onclick={() => confirmOpen = true}>철회 확인</Button>
		</div>

		<TaskDialog
			bind:open={taskOpen}
			title="입력 패널"
			description="포커스 트랩·Escape·복귀를 TaskDialog가 보완한다."
			submitLabel="저장"
			onsubmit={() => (taskOpen = false)}
		>
			<ChoiceGroup
				legend="편성 방식"
				name="demo-method"
				options={[
					{ value: 'all', label: '엔트리 편성' },
					{ value: 'recruit', label: '경매 편성' }
				]}
				bind:value={demoChoices}
			/>
		</TaskDialog>

		<ConfirmDialog
			bind:open={confirmOpen}
			title="참가를 철회할까요?"
			content="철회하면 선발 대기 순서가 사라집니다."
			confirmLabel="철회"
			danger
			onconfirm={() => (confirmOpen = false)}
		/>

		<Dialog
			bind:visible={dialogOpen}
			title="참가를 철회할까요?"
			content="철회하면 선발 대기 순서가 사라집니다."
			primaryText="철회"
			secondaryText="닫기"
			primaryButton={{ state: 'error' }}
			onprimary={() => (dialogOpen = false)}
		/>

		<Popup bind:visible={popupOpen} position="bottom" size={0} maskClosable>
			<div class="space-y-3 p-5">
				<h3 class="text-title-l">서버 선택</h3>
				<p class="text-body-s text-muted">P3에서 서버 목록 링크가 들어온다.</p>
				<Button size="full" fill="line" onclick={() => (popupOpen = false)}>닫기</Button>
			</div>
		</Popup>
	</section>

	<!-- 상태·미터·지표 -->
	<section class="mt-10" aria-labelledby="status">
		<h2 id="status" class="text-title-l">상태·미터·지표</h2>
		<div class="mt-3 grid gap-6 border-t border-line pt-4 lg:grid-cols-2">
			<div class="space-y-3">
				<div class="flex flex-wrap gap-2">
					<StatusTag status={SCRIM_STATUS.recruit} />
					<StatusTag status={SCRIM_STATUS.preparing} />
					<StatusTag status={MATCH_STATUS.completed} />
					<StatusTag status={MATCH_STATUS.ended_early} />
					<StatusTag status={MATCH_STATUS.cancelled} />
				</div>
				<div class="max-w-xs">
					<FillMeter current={7} total={10} label="선발 인원" />
				</div>
				<p class="text-caption text-muted">상태는 문구와 점으로 함께 표시하고, 색만으로 구분하지 않는다.</p>
			</div>
			<MetricList
				columns="grid-2"
				items={[
					{ label: '완료 Game', value: '128', unit: '경기' },
					{ label: '참가 사용자', value: '46', unit: '명' },
					{ label: '평균 경기 길이', value: '31분 24초' },
					{ label: '선발 인원', value: '7 / 10' }
				]}
			/>
		</div>
	</section>

	<!-- 표 -->
	<section class="mt-10" aria-labelledby="table">
		<h2 id="table" class="text-title-l">표</h2>
		<p class="mt-1 text-body-s text-muted">좁은 화면에서는 같은 DOM이 라벨-값 카드로 재배치된다.</p>
		<div class="mt-3 border-t border-line pt-2">
			<DataTable
				caption="참가자 명단"
				columns={[{ label: '참가자' }, { label: '포지션' }, { label: '상태', align: 'end' }]}
				items={demoRoster}
			>
				{#snippet row(item)}
					<tr>
						<th scope="row">{item.name}</th>
						<td data-label="포지션">{POSITION_LABEL[item.position]}</td>
						<td data-label="상태" class="text-end"><StatusTag status={item.status} /></td>
					</tr>
				{/snippet}
			</DataTable>
		</div>
	</section>

	<!-- 비동기 영역 -->
	<section class="mt-10" aria-labelledby="async">
		<h2 id="async" class="text-title-l">비동기 영역</h2>
		<p class="mt-1 text-body-s text-muted">위 시나리오 전환에 따라 로딩·빈 데이터·오류·정상이 바뀐다.</p>
		<div class="mt-3 border-t border-line pt-4">
			<AsyncSection
				result={demoResult}
				label="비동기 영역 예시"
				emptyText="조건에 맞는 항목이 없습니다."
				loading={scenario === 'slow'}
				onretry={() => setScenario('normal')}
			>
				{#snippet children(items)}
					<ul class="divide-hairline">
						{#each items as item (item)}
							<li class="py-2 text-body-s">{item}</li>
						{/each}
					</ul>
				{/snippet}
			</AsyncSection>
		</div>
	</section>

	<!-- 선택·입력 -->
	<section class="mt-10" aria-labelledby="choice">
		<h2 id="choice" class="text-title-l">선택·입력</h2>
		<div class="mt-3 grid max-w-2xl gap-4 border-t border-line pt-4">
			<ChoiceGroup
				legend="상태"
				name="demo-status"
				options={[
					{ value: 'all', label: '전체' },
					{ value: 'recruit', label: '모집 중' }
				]}
				bind:value={demoChoices}
			/>
			<NativeField id="demo-datetime" label="예정 시각" hint="한국 시간(KST) 기준입니다.">
				{#snippet children(describedBy)}
					<input
						id="demo-datetime"
						type="datetime-local"
						aria-describedby={describedBy || undefined}
						class="min-h-11 rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
					/>
				{/snippet}
			</NativeField>
		</div>
	</section>

	<!-- 헤더 -->
	<section class="mt-10" aria-labelledby="headers">
		<h2 id="headers" class="text-title-l">헤더 변형</h2>
		<p class="mt-1 text-body-s text-muted">
			전역·서버·내전은 같은 헤더의 내용만 바뀐다. 문맥 목적지는 헤더 아래 레일 하나가 담당한다.
		</p>
		<div class="mt-3 space-y-6 border-t border-line pt-4">
			<div>
				<p class="category-label mb-2">서버 문맥</p>
				<div class="overflow-hidden rounded-sm border border-line">
					<AppHeader guild={demoGuild} viewer={demoViewer} />
				</div>
			</div>
			<div>
				<p class="category-label mb-2">내전 문맥</p>
				<div class="overflow-hidden rounded-sm border border-line">
					<AppHeader guild={demoGuild} scrim={demoScrim} viewer={demoViewer} />
				</div>
			</div>
		</div>
	</section>
</div>
