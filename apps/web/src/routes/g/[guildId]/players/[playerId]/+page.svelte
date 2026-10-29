<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Pagination } from 'stdf';
	import { formatDateTime } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import DataTable from '#lib/components/ui/DataTable.svelte';
	import MetricList from '#lib/components/ui/MetricList.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import { POSITION_LABEL } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const profile = $derived(data.profile);

	const gameHref = (matchId: string, gameId: string) =>
		`${resolve('/g/[guildId]/matches/[matchId]', { guildId: guild.id, matchId })}?game=${gameId}`;

	function goPage(target: number) {
		const url = new URL(String(page.url));
		if (target === 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(target));
		goto(url, { reset: false });
	}

	const columns = [
		{ label: '시각' },
		{ label: '상대' },
		{ label: '챔피언', hideInStack: true },
		{ label: '결과', align: 'end' as const }
	];

	const resultLabel = { win: '승리', loss: '패배', unknown: '결과 미확인' } as const;
	const resultColor = { win: 'var(--success)', loss: 'var(--danger)', unknown: 'var(--text-muted)' } as const;
</script>

<svelte:head>
	<title>{pageTitle(`${profile.player.displayName} 전적`, guild.name)}</title>
</svelte:head>

<PageHeader title={profile.player.displayName} description={profile.player.riotId ?? 'Riot 계정 미연결'} />

<div class="border-t border-line pt-4">
	<MetricList
		columns="grid-4"
		items={[
			{ label: '출전 Game', value: String(profile.totals.games), unit: '판' },
			{ label: '승리', value: String(profile.totals.wins) },
			{ label: '패배', value: String(profile.totals.losses) },
			{ label: '승률', value: profile.winRate === null ? '기록 없음' : `${profile.winRate.toFixed(1)}%` }
		]}
	/>
</div>

{#if profile.positionMmr && profile.positionMmr.length > 0}
	<section class="mt-10" aria-labelledby="mmr">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="mmr" class="text-title-l">포지션별 MMR</h2>
			<p class="text-caption text-muted">{profile.mmrSeason}</p>
		</div>
		<dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 lg:grid-cols-5">
			{#each profile.positionMmr as item (item.position)}
				<div>
					<dt class="text-caption text-muted">{POSITION_LABEL[item.position]}</dt>
					<dd class="tabular mt-0.5 text-title-m">{item.value.toLocaleString('ko-KR')}</dd>
					{#if item.status === 'pending'}
						<dd class="text-caption" style:color="var(--warning)">반영 보류</dd>
					{/if}
				</div>
			{/each}
		</dl>
	</section>
{/if}

<section class="mt-10" aria-labelledby="recent">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 id="recent" class="text-title-l">출전 기록</h2>
		<p class="tabular text-caption text-muted">총 {profile.total}건</p>
	</div>

	<div class="mt-3 border-t border-line pt-2">
		{#if profile.recent.length === 0}
			<p class="py-4 text-body-s text-muted">이 서버에서 출전한 기록이 없습니다.</p>
		{:else}
			<DataTable caption="출전 기록" {columns} items={profile.recent}>
				{#snippet row(item)}
					<tr>
						<th scope="row">{formatDateTime(item.playedAt)}</th>
						<td data-label="상대">
							<a class="underline-offset-4 hover:underline" href={gameHref(item.matchId, item.gameId)}>
								{item.opponent} · {item.gameNumber}경기
							</a>
						</td>
						<td data-label="챔피언" class="hide-in-stack">{item.champion}</td>
						<td data-label="결과" class="text-end">
							<span style:color={resultColor[item.result]}>{resultLabel[item.result]}</span>
						</td>
					</tr>
				{/snippet}
			</DataTable>

			{#if profile.total > data.pageSize}
				<div class="mt-6">
					<Pagination
						total={profile.total}
						pageSize={data.pageSize}
						current={data.page}
						maxShowPage={5}
						onchange={goPage}
					/>
				</div>
			{/if}
		{/if}
	</div>
</section>
