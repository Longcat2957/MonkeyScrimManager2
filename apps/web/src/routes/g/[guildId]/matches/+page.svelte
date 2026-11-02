<script lang="ts">
	import { CellGroup, Input, Loading, Tab } from 'stdf';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import PageNav from '#lib/components/common/PageNav.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import MatchListRow from '#lib/components/matches/MatchListRow.svelte';
	import type { MatchStatusFilter } from '#lib/features/matches/types.ts';
	import { nonSubmitButtons } from '#lib/ui/form.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTERS: { key: MatchStatusFilter; text: string }[] = [
		{ key: 'all', text: '전체' },
		{ key: 'in_progress', text: '진행 중' },
		{ key: 'done', text: '종료' }
	];

	const guildId = $derived(page.params.guildId!);
	const active = $derived(FILTERS.findIndex((filter) => filter.key === data.statusFilter));
	const labels = $derived(FILTERS.map((filter) => ({ text: `${filter.text} ${data.counts[filter.key]}` })));
	// 같은 목록의 검색·필터·쪽만 바뀌는 동안에는 이전 결과를 흐리게 둔다.
	const changing = $derived(navigating.to?.route.id === page.route.id);

	let query = $state('');
	$effect(() => {
		query = data.q;
	});

	function navigate(params: { status?: MatchStatusFilter; page?: number; q?: string }) {
		const url = new URL(page.url.href);
		const set = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
		if (params.status !== undefined || params.q !== undefined) url.searchParams.delete('page');
		if (params.status !== undefined) set('status', params.status === 'all' ? null : params.status);
		if (params.q !== undefined) set('q', params.q.trim() || null);
		if (params.page !== undefined) set('page', params.page === 1 ? null : String(params.page));
		goto(url, { reset: false });
	}
</script>

<svelte:head>
	<title>경기 기록 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-semibold">경기 기록</h1>

	{#if data.empty}
		<SectionState state="empty" message="아직 기록된 경기가 없어요" />
	{:else}
		<section aria-labelledby="match-list" class="flex flex-col gap-3">
			<h2 id="match-list" class="sr-only">{FILTERS[active]?.text} 경기</h2>
			<div class="flex flex-col gap-2 md:flex-row md:items-center">
				<form
					role="search"
					aria-label="경기 검색"
					{@attach nonSubmitButtons}
					class="-mx-2 -my-1 md:w-80"
					onsubmit={(event) => {
						event.preventDefault();
						navigate({ q: query });
					}}
				>
					<Input type="search" placeholder="내전·팀 이름 검색" bind:value={query} clear onclear={() => navigate({ q: '' })} maxlength={50} />
				</form>
				<!-- STDF Tab은 탭 역할을 알리지 않으므로 묶음 이름을 붙이고, 선택한 내용은 숨긴 영역 제목으로 알린다. -->
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<div role="group" aria-label="상태 필터" class="min-w-0 flex-1 border-b border-border">
						<Tab {labels} {active} onclickTab={(index) => navigate({ status: FILTERS[index]!.key })} />
					</div>
					{#if changing}<Loading type="1_0" height="6" width="6" />{/if}
				</div>
			</div>

			{#if data.matches.length === 0}
				<SectionState state="empty" message={data.q ? `'${data.q}'에 맞는 경기가 없어요` : '조건에 맞는 경기가 없어요'} />
			{:else}
				<div class={['transition-opacity', changing && 'opacity-50']}>
					<CellGroup my="0" mx="0" shadow="none">
						<ul>
							{#each data.matches as match, index (match.id)}
								<li>
									<MatchListRow {match} href={resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.id })} line={index < data.matches.length - 1} />
								</li>
							{/each}
						</ul>
					</CellGroup>
				</div>
			{/if}

			<PageNav total={data.total} pageSize={data.pageSize} current={data.page} onchange={(current) => navigate({ page: current })} />
		</section>
	{/if}
</div>
