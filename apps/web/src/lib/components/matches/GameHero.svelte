<script lang="ts">
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import type { GameDetail } from '#lib/features/matches/types.ts';
	import { formatDuration, formatLongDate, kdaRatio } from '#lib/features/matches/format.ts';

	// 게임 한 판의 머리: 이긴 진영, 진영별 킬 점수, 날짜·시간·패치, MVP. 배경은 MVP 챔피언 스플래시.
	let { game }: { game: GameDetail } = $props();

	const blue = $derived(game.sides.find((side) => side.side === 'blue')!);
	const red = $derived(game.sides.find((side) => side.side === 'red')!);
	const kills = (side: GameDetail['sides'][number]) => side.players.reduce((sum, player) => sum + player.kills, 0);
	const winner = $derived(game.sides.find((side) => side.win) ?? null);
	const mvp = $derived(game.sides.flatMap((side) => side.players).find((player) => player.badge === 'mvp') ?? null);
	const meta = $derived(
		[game.playedAt ? formatLongDate(game.playedAt) : null, formatDuration(game.durationSec), `패치 ${game.patch}`].filter(Boolean).join(' · ')
	);
</script>

<!-- 서버 홈 첫 카드처럼 화면 모드와 관계없이 어두운 바탕에 배경 아트를 깐다. -->
<section
	aria-label={`${game.order}게임 결과`}
	class={[
		'relative isolate overflow-hidden rounded-(--radius-box) border-l-4 bg-bg-base-dark text-text-dark ring-1 ring-white/10',
		winner?.side === 'red' ? 'border-l-error' : winner?.side === 'blue' ? 'border-l-info' : 'border-l-white/20'
	]}
>
	{#if game.splashUrl}
		<img src={game.splashUrl} alt="" class="absolute inset-0 -z-10 size-full object-cover object-[60%_20%] opacity-60" />
		<div class="absolute inset-0 -z-10 bg-linear-to-r from-bg-base-dark from-25% via-bg-base-dark/70 to-bg-base-dark/20"></div>
	{/if}
	<div class="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:p-7">
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center gap-2">
				{#if winner}
					<span class={['rounded-full border px-3 py-1 text-xs font-semibold', winner.side === 'red' ? 'border-error/60 text-error' : 'border-info/60 text-info']}>
						{winner.side === 'red' ? '레드' : '블루'} · {winner.teamName} 승리
					</span>
				{/if}
				{#if game.mmrStatus === 'pending'}<StatusTag text="MMR 반영 대기" state="warning" />{/if}
			</div>
			<p class="flex items-baseline gap-4 text-6xl font-black tabular-nums md:text-7xl">
				<span class="text-info">{kills(blue)}</span>
				<span aria-hidden="true" class="text-4xl text-white/40">:</span>
				<span class="text-error">{kills(red)}</span>
				<span class="sr-only">킬, 블루 {kills(blue)} 레드 {kills(red)}</span>
			</p>
			<p class="text-sm text-white/80">{meta}</p>
		</div>

		{#if mvp}
			<div class="flex items-center gap-3 rounded-(--radius-box) border border-warning/30 bg-black/50 p-3 pr-5 backdrop-blur-sm">
				{#if mvp.champion.iconUrl}
					<img src={mvp.champion.iconUrl} alt="" class="size-14 rounded-(--radius-form) ring-2 ring-warning" />
				{/if}
				<div class="flex min-w-0 flex-col">
					<span class="text-xs font-bold text-warning">MVP</span>
					<span class="truncate text-lg font-semibold">{mvp.displayName}</span>
					<span class="text-sm text-white/70 tabular-nums">{mvp.champion.name} · {mvp.kills}/{mvp.deaths}/{mvp.assists} · KDA {kdaRatio(mvp)}</span>
				</div>
			</div>
		{/if}
	</div>
</section>
