<script lang="ts">
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { GameDetail } from '#lib/features/matches/types.ts';
    import { formatDuration, formatLongDate, kdaRatio } from '#lib/features/matches/format.ts';

    // 세트 한 판의 머리: 이긴 진영, 진영별 킬 점수, 날짜·시간·패치, MVP. 배경은 MVP 챔피언 스플래시.
    let { game }: { game: GameDetail } = $props();

    const blue = $derived(game.sides.find((side) => side.side === 'blue')!);
    const red = $derived(game.sides.find((side) => side.side === 'red')!);
    const kills = (side: GameDetail['sides'][number]) =>
        side.players.some((player) => player.kills === null)
            ? '-'
            : side.players.reduce((sum, player) => sum + (player.kills ?? 0), 0);
    const winner = $derived(game.sides.find((side) => side.win) ?? null);
    const mvp = $derived(
        game.sides.flatMap((side) => side.players).find((player) => player.badge === 'mvp') ?? null
    );
    const meta = $derived(
        [
            game.playedAt ? formatLongDate(game.playedAt) : null,
            formatDuration(game.durationSec),
            `패치 ${game.patch}`
        ]
            .filter(Boolean)
            .join(' · ')
    );
</script>

<!-- 세트 킬은 시리즈 스코어와 분리하고, 블루·레드 진영 이름과 함께 표시한다. -->
<div
    class="inverse-surface relative isolate overflow-hidden rounded-(--radius-box) border border-line bg-surface text-ink"
>
    {#if game.splashUrl}
        <img
            src={game.splashUrl}
            alt=""
            class="pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-2/3 object-cover object-[60%_25%] opacity-15"
        />
    {/if}
    <header
        class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5"
    >
        <h2 id="game-heading" class="text-sm font-bold">{game.order}세트 결과</h2>
        <p class="text-xs text-ink-2">{meta}</p>
    </header>
    <div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-4">
        <div class="flex min-w-0 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
                {#if winner}
                    <strong class="text-ui"
                        >{winner.side === 'red' ? '레드' : '블루'} · {winner.teamName} 승리</strong
                    >
                {/if}
                {#if game.mmrStatus === 'pending'}
                    <StatusTag text="MMR 반영 대기" state="warning" />
                {/if}
            </div>
            <p class="flex items-baseline gap-2 tabular-nums">
                <span class="text-xs font-medium text-ink-2">블루 킬</span>
                <strong class="text-3xl text-team-blue">{kills(blue)}</strong>
                <span aria-hidden="true" class="text-lg text-muted">:</span>
                <strong class="text-3xl text-team-red">{kills(red)}</strong>
                <span class="text-xs font-medium text-ink-2">레드 킬</span>
            </p>
        </div>

        {#if mvp}
            <div class="flex min-w-0 items-center gap-2.5">
                {#if mvp.champion.iconUrl}
                    <img src={mvp.champion.iconUrl} alt="" class="size-10 rounded-(--radius-form)" />
                {/if}
                <div class="flex min-w-0 flex-col">
                    <span class="text-micro font-bold text-role-gold">MVP</span>
                    <span class="break-words text-sm font-semibold">{mvp.displayName}</span>
                    <span class="text-xs text-ink-2 tabular-nums"
                        >{mvp.champion.name} · {mvp.kills ?? '-'}/{mvp.deaths ?? '-'}/{mvp.assists ?? '-'} · KDA
                        {kdaRatio(mvp)}</span
                    >
                </div>
            </div>
        {/if}
    </div>
</div>
