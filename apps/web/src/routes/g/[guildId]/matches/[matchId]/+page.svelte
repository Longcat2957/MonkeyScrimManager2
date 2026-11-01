<script lang="ts">
	import { Button, Tab } from 'stdf';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import GameHero from '#lib/components/matches/GameHero.svelte';
	import GamePlayerDialog from '#lib/components/matches/GamePlayerDialog.svelte';
	import GameTeamTable from '#lib/components/matches/GameTeamTable.svelte';
	import RoflUploadDialog from '#lib/components/matches/RoflUploadDialog.svelte';
	import { MATCH_STATUS } from '#lib/features/labels.ts';
	import type { GamePlayer } from '#lib/features/matches/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guildId = $derived(page.params.guildId!);
	const match = $derived(data.match);
	const status = $derived(MATCH_STATUS[match.status]);
	// 정상 종료한 시리즈만 승자를 표시한다.
	const winner = $derived(match.status === 'completed' && match.scoreA !== match.scoreB ? (match.scoreA > match.scoreB ? 'a' : 'b') : null);
	const activeGame = $derived(Math.max(0, match.games.findIndex((game) => game.id === data.game?.id)));
	const labels = $derived(match.games.map((game) => ({ text: `${game.order}게임` })));
	const maxDamage = $derived(Math.max(0, ...(data.game?.sides.flatMap((side) => side.players.flatMap((player) => [player.damage ?? 0, player.damageTaken ?? 0])) ?? [])));
	const remaining = $derived(Math.max(0, match.bestOf - match.games.length));

	let uploadOpen = $state(false);
	let detailOpen = $state(false);
	let detailPlayer = $state<GamePlayer | null>(null);

	function selectGame(index: number) {
		const url = new URL(page.url.href);
		url.searchParams.set('game', match.games[index]!.id);
		goto(url, { reset: false });
	}

	async function recorded(order: number | null) {
		await invalidateAll();
		const game = match.games.find((item) => item.order === order);
		if (game) selectGame(match.games.indexOf(game));
	}
</script>

<svelte:head>
	<title>{match.teamA} vs {match.teamB} · 경기 | {SERVICE_NAME}</title>
</svelte:head>

{#snippet team(name: string, side: 'a' | 'b')}
	<span class={['min-w-0 truncate text-lg font-semibold md:text-2xl', winner && winner !== side && 'opacity-50']}>
		{name}{#if winner === side}<span class="sr-only"> 승리</span>{/if}
	</span>
{/snippet}

<div class="flex flex-col gap-6">
	<!-- 시리즈 머리 -->
	<header class="flex flex-col gap-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="flex min-w-0 flex-col gap-1">
				<h1 class="text-2xl font-semibold text-balance">{match.teamA} vs {match.teamB}</h1>
				<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm opacity-80">
					<a href={resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: match.scrim.id })} class="underline-offset-4 hover:underline">{match.scrim.title}</a>
					<span aria-hidden="true">·</span><span>BO{match.bestOf}</span>
					{#if match.hardFearless}<span aria-hidden="true">·</span><span>하드 피어리스</span>{/if}
					<StatusTag text={status.text} state={status.state} />
				</p>
			</div>
			{#if data.can.upload}
				<Button fill="base" size="auto" heightOut="0" heightIn="2" injClass="px-4" disabled={remaining === 0} onclick={() => (uploadOpen = true)}>ROFL 업로드</Button>
			{/if}
		</div>
		<p class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-(--radius-box) border border-border bg-bg-surface px-5 py-4 dark:bg-bg-surface-dark">
			<span class="flex min-w-0 justify-end">{@render team(match.teamA, 'a')}</span>
			<span class="text-4xl font-black tabular-nums">{match.scoreA} <span aria-hidden="true" class="opacity-40">:</span><span class="sr-only">대</span> {match.scoreB}</span>
			<span class="flex min-w-0">{@render team(match.teamB, 'b')}</span>
		</p>
	</header>

	{#if !data.game}
		<SectionState state="empty" message="아직 기록된 게임이 없어요" />
	{:else}
		<section aria-labelledby="game-heading" class="flex flex-col gap-4">
			<h2 id="game-heading" class="sr-only">{data.game.order}게임</h2>
			{#if match.games.length > 1}
				<div role="group" aria-label="게임 선택" class="border-b border-border">
					<Tab {labels} active={activeGame} onclickTab={selectGame} />
				</div>
			{/if}
			<GameHero game={data.game} />
			{#each data.game.sides as side (side.side)}
				<GameTeamTable {side} {guildId} durationSec={data.game.durationSec} {maxDamage} ondetail={(player) => ((detailPlayer = player), (detailOpen = true))} />
			{/each}
		</section>
	{/if}

	{#if data.usedChampions}
		<section aria-labelledby="fearless" class="flex flex-col gap-3">
			<h2 id="fearless" class="text-lg font-semibold">다음 게임에서 쓸 수 없는 챔피언</h2>
			<div class="grid gap-3 md:grid-cols-2">
				{#each [[match.teamA, data.usedChampions.a], [match.teamB, data.usedChampions.b]] as const as [name, champions] (name)}
					<div class="flex flex-col gap-2 rounded-(--radius-box) border border-border bg-bg-surface p-4 dark:bg-bg-surface-dark">
						<h3 class="text-sm font-semibold">{name}</h3>
						<ul class="flex flex-wrap gap-2">
							{#each champions as champion (champion.id)}
								<li class="flex items-center gap-1.5 rounded-(--radius-small) bg-bg-highlight/60 py-1 pr-2 pl-1 text-xs dark:bg-bg-highlight-dark/60">
									{#if champion.iconUrl}<img src={champion.iconUrl} alt="" class="size-6 rounded-(--radius-small) grayscale" />{/if}{champion.name}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

{#if data.game}
	<GamePlayerDialog bind:open={detailOpen} player={detailPlayer} durationSec={data.game.durationSec} />
{/if}
{#if data.can.upload}
	<RoflUploadDialog bind:open={uploadOpen} max={Math.max(1, remaining)} onrecorded={recorded} />
{/if}
