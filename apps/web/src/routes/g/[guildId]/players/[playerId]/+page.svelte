<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Pagination } from 'stdf';
	import { formatDateTime } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
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

	const resultLabel = { win: '승리', loss: '패배', unknown: '결과 미확인' } as const;
	const resultClass = { win: 'text-accent', loss: 'text-rose', unknown: 'text-faint' } as const;
</script>

<svelte:head>
	<title>{pageTitle(`${profile.player.displayName} 전적`, guild.name)}</title>
</svelte:head>

<h1 class="page-title">{profile.player.displayName}</h1>
<p class="mt-1.5 text-[13px] text-mut">{profile.player.riotId ?? 'Riot 계정 미연결'}</p>

<div class="stats mt-6 grid-cols-2 sm:grid-cols-4">
	<div class="stat"><span>출전 Game</span><b>{profile.totals.games}<small>판</small></b></div>
	<div class="stat"><span>승리</span><b>{profile.totals.wins}</b></div>
	<div class="stat"><span>패배</span><b>{profile.totals.losses}</b></div>
	<div class="stat">
		<span>승률</span>
		<b>{profile.winRate === null ? '—' : `${profile.winRate.toFixed(1)}%`}</b>
	</div>
</div>

{#if profile.positionMmr && profile.positionMmr.length > 0}
	<section class="mt-8" aria-labelledby="mmr">
		<div class="region">
			<span class="lbl" id="mmr">포지션별 MMR</span>
			<span class="count">{profile.mmrSeason}</span>
		</div>
		<dl class="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
			{#each profile.positionMmr as item (item.position)}
				<div class="border-l border-line px-4 py-3 first:border-l-0">
					<dt class="text-[11px] text-faint">{POSITION_LABEL[item.position]}</dt>
					<dd class="mt-0.5 font-brand text-[26px] leading-none tabular">{item.value.toLocaleString('ko-KR')}</dd>
					{#if item.status === 'pending'}
						<dd class="mt-0.5 text-[10.5px] text-gold">반영 보류</dd>
					{/if}
				</div>
			{/each}
		</dl>
	</section>
{/if}

<section class="mt-8" aria-labelledby="recent">
	<div class="region">
		<span class="lbl" id="recent">출전 기록</span>
		<span class="count">총 {profile.total}건</span>
	</div>

	{#if profile.recent.length === 0}
		<div class="panel px-5 py-6"><p class="text-[13px] text-mut">이 서버에서 출전한 기록이 없습니다.</p></div>
	{:else}
		<div class="panel data-table-container px-5 py-2">
			<table class="data-table">
				<caption class="sr-only">출전 기록</caption>
				<thead>
					<tr>
						<th scope="col">시각</th>
						<th scope="col">상대</th>
						<th scope="col" class="hide-in-stack">챔피언</th>
						<th scope="col" class="text-end">결과</th>
					</tr>
				</thead>
				<tbody>
					{#each profile.recent as item (item.gameId)}
						<tr>
							<th scope="row" class="whitespace-nowrap tabular">{formatDateTime(item.playedAt)}</th>
							<td data-label="상대">
								<a class="underline-offset-4 hover:underline" href={gameHref(item.matchId, item.gameId)}>
									{item.opponent} · {item.gameNumber}경기
								</a>
							</td>
							<td data-label="챔피언" class="hide-in-stack">{item.champion}</td>
							<td data-label="결과" class="text-end {resultClass[item.result]}">{resultLabel[item.result]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if profile.total > data.pageSize}
			<div class="mt-6">
				<Pagination total={profile.total} pageSize={data.pageSize} current={data.page} maxShowPage={5} onchange={goPage} />
			</div>
		{/if}
	{/if}
</section>
