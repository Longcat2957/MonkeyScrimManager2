<script lang="ts">
	import { pageTitle } from '#lib/shell/titles.ts';
	import { POSITION_LABEL } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const stats = $derived(data.stats);
</script>

<svelte:head>
	<title>{pageTitle('통계', guild.name)}</title>
</svelte:head>

<h1 class="page-title">통계</h1>

<div class="stats mt-6 grid-cols-1 sm:grid-cols-3">
	<div class="stat"><span>완료 Game</span><b>{stats.games}<small>경기</small></b></div>
	<div class="stat"><span>참가 사용자</span><b>{stats.players}<small>명</small></b></div>
	<div class="stat"><span>평균 경기 길이</span><b>{stats.averageDurationMs === null ? '—' : Math.round(stats.averageDurationMs / 60000)}<small>분</small></b></div>
</div>

<section class="mt-8" aria-labelledby="breakdown">
	<div class="region">
		<span class="lbl" id="breakdown">포지션별 집계</span>
		<span class="count">완료된 Game만</span>
	</div>

	{#if stats.games === 0}
		<div class="panel px-5 py-6"><p class="text-[13px] text-mut">아직 집계할 경기가 없습니다.</p></div>
	{:else}
		<div class="panel data-table-container px-5 py-2">
			<table class="data-table">
				<caption class="sr-only">포지션별 집계</caption>
				<thead>
					<tr>
						<th scope="col">포지션</th>
						<th scope="col" class="text-end">표본 Game</th>
						<th scope="col" class="text-end">평균 KDA</th>
						<th scope="col" class="text-end">평균 CS</th>
					</tr>
				</thead>
				<tbody>
					{#each stats.positions as item (item.position)}
						<tr>
							<th scope="row">{POSITION_LABEL[item.position]}</th>
							<td data-label="표본 Game" class="tabular text-end">{item.games}</td>
							<td data-label="평균 KDA" class="tabular text-end">{item.games === 0 ? '—' : item.kda.toFixed(2)}</td>
							<td data-label="평균 CS" class="tabular text-end">{item.games === 0 ? '—' : Math.round(item.cs)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
