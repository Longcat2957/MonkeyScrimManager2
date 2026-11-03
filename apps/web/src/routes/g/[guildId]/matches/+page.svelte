<script lang="ts">
	import { Input, Loading } from 'stdf';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import PageNav from '#lib/components/common/PageNav.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import MatchTable from '#lib/components/matches/MatchTable.svelte';
	import type { MatchListItem } from '#lib/features/matches/types.ts';
	import { nonSubmitButtons } from '#lib/ui/form.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guildId = $derived(page.params.guildId!);
	// 같은 목록의 검색·쪽만 바뀌는 동안에는 이전 결과를 흐리게 둔다.
	const changing = $derived(navigating.to?.route.id === page.route.id);
	const hrefFor = (match: MatchListItem) => resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.id });

	let query = $state('');
	$effect(() => {
		query = data.q;
	});

	function navigate(params: { page?: number; q?: string }) {
		const url = new URL(page.url.href);
		const set = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
		if (params.q !== undefined) {
			url.searchParams.delete('page');
			set('q', params.q.trim() || null);
		}
		if (params.page !== undefined) set('page', params.page === 1 ? null : String(params.page));
		goto(url, { reset: false });
	}
</script>

<svelte:head>
	<title>경기 기록 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<h1 class="flex items-center gap-2 text-2xl font-semibold">
			경기 기록
			{#if changing}<Loading type="1_0" height="6" width="6" />{/if}
		</h1>
		{#if !data.empty}
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
		{/if}
	</div>

	{#if data.empty}
		<SectionState state="empty" message="아직 기록된 경기가 없어요" />
	{:else}
		<div class={['flex flex-col gap-6 transition-opacity', changing && 'opacity-50']}>
			<!-- 진행 중인 경기가 없으면 빈 표를 두지 않는다. -->
			{#if data.live.length}
				<MatchTable id="live-matches" title="진행 중" count={data.live.length} matches={data.live} emptyMessage="" {hrefFor} />
			{/if}
			<MatchTable
				id="done-matches"
				title="종료"
				count={data.doneTotal}
				matches={data.done}
				emptyMessage={data.q ? `'${data.q}'에 맞는 경기가 없어요` : '아직 끝난 경기가 없어요'}
				{hrefFor}
			>
				{#snippet footer()}
					{#if data.doneTotal > data.pageSize}
						<div class="border-t border-border py-2">
							<PageNav total={data.doneTotal} pageSize={data.pageSize} current={data.page} onchange={(current) => navigate({ page: current })} />
						</div>
					{/if}
				{/snippet}
			</MatchTable>
		</div>
	{/if}
</div>
