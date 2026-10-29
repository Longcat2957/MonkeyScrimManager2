<script lang="ts">
	import { formatDuration } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import DataTable from '#lib/components/ui/DataTable.svelte';
	import MetricList from '#lib/components/ui/MetricList.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import { POSITION_LABEL } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const stats = $derived(data.stats);

	const columns = [
		{ label: '포지션' },
		{ label: '표본 Game', align: 'end' as const },
		{ label: '평균 KDA', align: 'end' as const },
		{ label: '평균 CS', align: 'end' as const }
	];
</script>

<svelte:head>
	<title>{pageTitle('통계', guild.name)}</title>
</svelte:head>

<PageHeader title="서버 통계" />

<div class="border-t border-line pt-4">
	<MetricList
		columns="grid-4"
		items={[
			{ label: '완료 Game', value: String(stats.games), unit: '경기' },
			{ label: '참가 사용자', value: String(stats.players), unit: '명' },
			{ label: '평균 경기 길이', value: formatDuration(stats.averageDurationMs) }
		]}
	/>
</div>

<section class="mt-10" aria-labelledby="breakdown">
	<h2 id="breakdown" class="text-title-l">포지션별 집계</h2>
	<p class="mt-1 text-body-s text-muted">완료된 Game만 집계합니다. 표본이 0이면 평균을 만들지 않습니다.</p>

	<div class="mt-3 border-t border-line pt-2">
		{#if stats.games === 0}
			<p class="py-4 text-body-s text-muted">아직 집계할 경기가 없습니다.</p>
		{:else}
			<DataTable caption="포지션별 집계" {columns} items={stats.positions}>
				{#snippet row(item)}
					<tr>
						<th scope="row">{POSITION_LABEL[item.position]}</th>
						<td data-label="표본 Game" class="tabular text-end">{item.games}</td>
						<td data-label="평균 KDA" class="tabular text-end">
							{item.games === 0 ? '—' : item.kda.toFixed(2)}
						</td>
						<td data-label="평균 CS" class="tabular text-end">
							{item.games === 0 ? '—' : Math.round(item.cs).toString()}
						</td>
					</tr>
				{/snippet}
			</DataTable>
		{/if}
	</div>
</section>
