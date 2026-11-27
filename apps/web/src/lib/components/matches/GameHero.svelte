<script lang="ts">
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { GameDetail } from '#lib/features/matches/types.ts';
    import { formatDuration, formatLongDate, formatPatch, kdaRatio } from '#lib/features/matches/format.ts';

    // 시리즈 점수와 구분하여 선택 세트의 일시·패치·MVP를 비교표 머리에 표시한다.
    let { game }: { game: GameDetail } = $props();

    const mvp = $derived(
        game.sides.flatMap((side) => side.players).find((player) => player.badge === 'mvp') ?? null
    );
    const meta = $derived(
        [
            game.playedAt ? formatLongDate(game.playedAt) : null,
            formatDuration(game.durationSec),
            `패치 ${formatPatch(game.patch)}`
        ]
            .filter(Boolean)
            .join(' · ')
    );
</script>

<header
    class={[
        'grid min-w-0 border-b border-line',
        mvp && '@min-[36rem]/record:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'
    ]}
>
    <div class="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-3 sm:px-4">
        <div class="flex flex-wrap items-center gap-2">
            <h2 id="game-heading" class="text-lg font-bold"><span>{game.order}세트</span> 결과</h2>
            {#if game.mmrStatus === 'pending'}<StatusTag text="MMR 반영 대기" state="warning" />{/if}
        </div>
        <p class="text-xs text-muted">{meta}</p>
    </div>
    {#if mvp}
        <div
            class="relative isolate flex min-w-0 flex-wrap items-center gap-2 overflow-hidden bg-surface-2 px-3 py-2 sm:px-4"
        >
            {#if game.splashUrl}
                <img
                    src={game.splashUrl}
                    alt=""
                    class="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-[60%_25%] opacity-10"
                />
            {/if}
            {#if mvp.champion.iconUrl}<img
                    src={mvp.champion.iconUrl}
                    alt=""
                    class="size-8 rounded-form"
                />{/if}
            <div class="min-w-0">
                <p class="break-words text-ui font-semibold">
                    {mvp.displayName} <span class="text-xs text-role-gold">MVP</span>
                </p>
                <p class="text-xs text-ink-2 tabular-nums">
                    {mvp.champion.name} · {mvp.kills ?? '-'}/{mvp.deaths ?? '-'}/{mvp.assists ?? '-'} · KDA {kdaRatio(
                        mvp
                    )}
                </p>
            </div>
        </div>
    {/if}
</header>
