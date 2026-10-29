<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Button, Input, Pagination } from 'stdf';
	import { pageTitle } from '#lib/shell/titles.ts';
	import MatchRow from '#lib/components/records/MatchRow.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);

	function go(patch: Record<string, string | number | null>) {
		const url = new URL(String(page.url));
		for (const [key, value] of Object.entries(patch)) {
			const removable = value === null || value === '' || value === 'all' || (key === 'page' && Number(value) === 1);
			if (removable) url.searchParams.delete(key);
			else url.searchParams.set(key, String(value));
		}
		goto(url, { reset: false });
	}

	// 입력 중인 검색어는 로컬에 두고, 제출할 때만 URL에 반영한다.
	let query = $state(untrack(() => data.q));
	// URL과 입력값이 마지막으로 같아진 지점을 기억해 뒤로가기를 감지한다.
	let syncedQuery = untrack(() => data.q);
	$effect(() => {
		// 뒤로가기처럼 URL이 바뀌면 입력값을 그 상태로 되돌린다.
		if (data.q !== syncedQuery) {
			query = data.q;
			syncedQuery = data.q;
		}
	});

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		go({ q: query.trim(), page: 1 });
	}

	const matchHref = (matchId: string) =>
		resolve('/g/[guildId]/matches/[matchId]', { guildId: guild.id, matchId });
</script>

<svelte:head>
	<title>{pageTitle('경기 기록', guild.name)}</title>
</svelte:head>

<PageHeader title="경기 기록" />

<!-- 검색·상태 필터. 결과 없음 안내에도 같은 조작을 복제하지 않는다. -->
<form class="flex flex-wrap items-end gap-3 border-t border-line pt-4" onsubmit={submitSearch} role="search">
	<div class="min-w-0 flex-1 basis-64">
		<Input title="검색" placeholder="내전명 또는 팀명" type="search" py="2" bind:value={query} />
	</div>
	<div class="grid gap-1">
		<label for="match-status" class="text-body-s font-semibold">상태</label>
		<select
			id="match-status"
			value={data.status}
			onchange={(event) => go({ status: event.currentTarget.value, page: 1 })}
			class="min-h-11 rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
		>
			<option value="all">전체</option>
			<option value="in_progress">진행 중</option>
			<option value="completed">종료</option>
			<option value="ended_early">중도 종료</option>
			<option value="cancelled">취소</option>
		</select>
	</div>
	<Button type="submit" size="auto" injClass="px-4" fill="line">조회</Button>
</form>

<div class="mt-6">
	{#if data.result.total === 0}
		<p class="py-4 text-body-s text-muted">
			{data.q || data.status !== 'all' ? '조건에 맞는 기록이 없습니다.' : '아직 기록된 경기가 없습니다.'}
		</p>
	{:else}
		<p class="text-caption text-muted">총 {data.result.total}건</p>
		<ul class="mt-2 border-t border-line">
			{#each data.result.items as match (match.id)}
				<MatchRow {match} href={matchHref(match.id)} />
			{/each}
		</ul>
		{#if data.result.total > data.pageSize}
			<div class="mt-6">
				<Pagination
					total={data.result.total}
					pageSize={data.pageSize}
					current={data.page}
					maxShowPage={5}
					onchange={(current) => go({ page: current })}
				/>
			</div>
		{/if}
	{/if}
</div>
