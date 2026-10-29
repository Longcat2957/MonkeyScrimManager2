<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Input, Pagination } from 'stdf';
	import { untrack } from 'svelte';
	import { pageTitle } from '#lib/shell/titles.ts';
	import MatchRow from '#lib/components/records/MatchRow.svelte';
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

<h1 class="page-title">경기 기록</h1>

<form class="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-4" onsubmit={submitSearch} role="search">
	<div class="min-w-0 flex-1 basis-64">
		<Input title="검색" placeholder="내전명 또는 팀명" type="search" py="2" bind:value={query} />
	</div>
	<div class="grid gap-1.5">
		<label for="match-status" class="text-[12px] font-semibold text-mut">상태</label>
		<select id="match-status" class="field w-36" value={data.status} onchange={(event) => go({ status: event.currentTarget.value, page: 1 })}>
			<option value="all">전체</option>
			<option value="in_progress">진행 중</option>
			<option value="completed">종료</option>
			<option value="ended_early">중도 종료</option>
			<option value="cancelled">취소</option>
		</select>
	</div>
	<button type="submit" class="btn">조회</button>
</form>

<div class="region mt-7">
	<span class="lbl">경기 목록</span>
	<span class="count">총 {data.result.total}건</span>
</div>

{#if data.result.total === 0}
	<div class="panel px-5 py-6">
		<p class="text-[13px] text-mut">
			{data.q || data.status !== 'all' ? '조건에 맞는 기록이 없습니다.' : '아직 기록된 경기가 없습니다.'}
		</p>
	</div>
{:else}
	<div class="panel">
		{#each data.result.items as match (match.id)}
			<MatchRow {match} href={matchHref(match.id)} />
		{/each}
	</div>

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
