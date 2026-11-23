<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { AchievementRanking, SeasonTitleId } from '#lib/features/players/achievements.ts';

    let { items, current = $bindable(0) }: { items: AchievementRanking[]; current?: number } = $props();

    const item = $derived(items[current] ?? items[0]);
    const artwork = {
        'season-kills': 'Zed',
        'season-assists': 'Yuumi',
        'season-damage': 'Azir',
        'season-participation': 'Thresh',
        'season-wards': 'Thresh',
        'season-efficiency': 'Ornn',
        'season-cs': 'Azir',
        'season-tanking': 'Ornn',
        'season-protection': 'Yuumi',
        'season-clean-sheet': 'Zed',
        'season-champion-pool': 'Azir',
        'season-one-trick': 'Zed',
        'season-positions': 'Thresh',
        'season-decider': 'Ornn',
        'season-series-rate': 'Yuumi'
    } as const satisfies Record<SeasonTitleId, string>;

    // 양끝을 이어 붙이되 칭호가 적은 시즌에는 같은 카드를 복제하지 않는다.
    const slides = $derived.by(() => {
        const result = [];
        const left = Math.min(2, Math.floor((items.length - 1) / 2));
        const right = Math.min(2, items.length - 1 - left);
        for (let offset = -left; offset <= right && items.length; offset++) {
            const entry = items[(current + offset + items.length) % items.length]!;
            result.push({ entry, offset, winners: entry.entries.filter((player) => player.rank === 1) });
        }
        return result;
    });

    function move(offset: number) {
        if (items.length > 1) current = (current + offset + items.length) % items.length;
    }

    let touch: { x: number; y: number; id: number } | null = null;
    function swipeStart(event: TouchEvent) {
        const first = event.touches[0];
        touch =
            event.touches.length === 1 && first
                ? { x: first.clientX, y: first.clientY, id: first.identifier }
                : null;
    }

    function swipeEnd(event: TouchEvent) {
        const start = touch;
        touch = null;
        const end = [...event.changedTouches].find((point) => point.identifier === start?.id);
        if (!start || !end || event.touches.length) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
    }
</script>

<!-- 업적 탐색은 사용자 데이터·키보드 제어가 필요해 서비스에서 직접 구성한다. -->
{#if item}
    <div role="group" aria-roledescription="캐러셀" aria-label="시즌 칭호" class="deck min-w-0">
        <div
            role="presentation"
            class="stage relative isolate grid touch-pan-y place-items-center overflow-clip"
            ontouchstart={swipeStart}
            ontouchend={swipeEnd}
            ontouchcancel={() => (touch = null)}
        >
            {#each slides as { entry, offset, winners } (entry.id)}
                {@const art = artwork[entry.titleId]}
                <article
                    class="slide"
                    data-art={art}
                    data-active={offset === 0}
                    data-prev={entry.id === items[(current - 1 + items.length) % items.length]?.id}
                    data-next={entry.id === items[(current + 1) % items.length]?.id}
                    inert={offset !== 0}
                    aria-hidden={offset !== 0}
                    style:--offset={offset}
                    style:--depth={Math.abs(offset)}
                >
                    <img class="splash" src={`/riot/title-art/${art}.webp`} alt="" />
                    <div class="content">
                        <div class="portraits" aria-hidden="true">
                            {#each winners.slice(0, 2) as winner (winner.userId)}
                                <div class="portrait">
                                    <PlayerFace
                                        size="lg"
                                        name={winner.displayName}
                                        imageUrl={winner.iconUrl}
                                    />
                                </div>
                            {/each}
                        </div>
                        <div class="min-w-0">
                            <h3 class="title">{entry.title}</h3>
                            <p class="mt-1 text-xs leading-relaxed text-white/80">{entry.description}</p>
                            <ul aria-label="시즌 칭호 보유자" class="holders">
                                {#each winners as winner (winner.userId)}
                                    <li>
                                        <b>{winner.displayName}</b>
                                        <span>{winner.sample}{entry.sampleUnit}</span>
                                    </li>
                                {/each}
                            </ul>
                            {#if winners[0]}
                                <p class="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                                    <strong>{winners[0].value}</strong>
                                    <span class="text-xs text-white/75"
                                        >{winners[0].tied ? `공동 1위 · ${winners.length}명` : '1위'}</span
                                    >
                                </p>
                            {/if}
                        </div>
                    </div>
                </article>
            {/each}
            {#if items.length > 1}
                {#each [-1, 1] as direction (direction)}
                    <div class={['arrow', direction < 0 ? 'prev left-1' : 'next right-1']}>
                        <Button
                            variant="quiet"
                            ariaLabel={direction < 0 ? '이전 칭호' : '다음 칭호'}
                            class="size-11! rounded-full! border border-line-strong bg-ground/90 p-0!"
                            onclick={() => move(direction)}
                        >
                            <svg
                                class:rotate-180={direction < 0}
                                aria-hidden="true"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"><path d="m9 18 6-6-6-6" /></svg
                            >
                        </Button>
                    </div>
                {/each}
            {/if}
        </div>
        <p class="sr-only" aria-live="polite" aria-atomic="true">
            {items.length}개 중 {current + 1}번째 칭호: {item.title}
        </p>
        {#if items.length > 1}
            <div role="group" aria-label="칭호 바로 선택" class="flex flex-wrap justify-center">
                {#each items as achievement, index (achievement.id)}
                    <button
                        type="button"
                        class="dot"
                        aria-label={achievement.title}
                        aria-current={index === current ? 'true' : undefined}
                        onclick={() => (current = index)}
                    ></button>
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
    .deck {
        container-type: inline-size;
    }
    .stage {
        padding-block: 0.75rem 0.5rem;
    }
    .slide {
        --accent: #eda6d1;
        --spread: min(21cqi, 18rem);
        grid-area: 1 / 1;
        position: relative;
        isolation: isolate;
        display: grid;
        align-content: center;
        width: min(36rem, calc(100% - 6rem));
        min-height: clamp(14rem, 21cqi, 17rem);
        overflow: hidden;
        border: 1px solid color-mix(in srgb, var(--accent) 78%, transparent);
        border-radius: 1.4rem;
        background: #090c15;
        color: white;
        transform: translateX(calc(var(--offset) * var(--spread))) scale(calc(1 - var(--depth) * 0.075));
        z-index: calc(3 - var(--depth));
        transition:
            transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 240ms,
            filter 240ms;
    }
    .slide[data-art='Zed'] {
        --accent: #ff99ab;
    }
    .slide[data-art='Azir'] {
        --accent: #f4cb78;
    }
    .slide[data-art='Thresh'] {
        --accent: #78e5d3;
    }
    .slide[data-art='Ornn'] {
        --accent: #abc3ff;
    }
    .slide[data-active='false'] {
        opacity: 0.45;
        filter: blur(1.3px);
        pointer-events: none;
    }
    .splash,
    .slide::after {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
    }
    .splash {
        object-fit: cover;
        object-position: 64% 32%;
    }
    .slide::after {
        content: '';
        background:
            linear-gradient(110deg, color-mix(in srgb, var(--accent) 20%, #080a13) 0%, transparent 57%),
            linear-gradient(90deg, rgb(5 7 13 / 0.63), rgb(5 7 13 / 0.84) 60%),
            linear-gradient(0deg, #080a13, transparent);
    }
    .content {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        padding: 2rem clamp(1rem, 3cqi, 3rem);
    }
    .portraits {
        display: grid;
        flex: none;
        gap: 0.25rem;
    }
    .portrait {
        padding: 2px;
        border: 1px solid var(--accent);
        border-radius: 0.8rem;
        background: #0a0c15;
    }
    .portrait :global(img),
    .portrait :global(span) {
        border-radius: 0.6rem;
    }
    .title {
        color: var(--accent);
        font-size: clamp(1.375rem, 2.75cqi, 2.125rem);
        font-weight: 700;
        line-height: 1.18;
        word-break: keep-all;
        overflow-wrap: anywhere;
    }
    .holders {
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem 0.7rem;
        margin-top: 0.75rem;
        font-size: 0.875rem;
        overflow-wrap: anywhere;
    }
    .holders span {
        font-size: 0.75rem;
        color: rgb(255 255 255 / 0.75);
    }
    .arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 4;
    }
    .dot {
        display: grid;
        width: 1.5rem;
        height: 2rem;
        place-items: center;
    }
    .dot::after {
        content: '';
        height: 0.375rem;
        width: 0.375rem;
        border-radius: 1rem;
        background: var(--color-muted);
    }
    .dot[aria-current='true']::after {
        width: 1.15rem;
        background: var(--color-nexus);
    }
    .stage:has(.prev :global(button:focus-visible)) .slide[data-prev='true'],
    .stage:has(.next :global(button:focus-visible)) .slide[data-next='true'] {
        opacity: 0.85;
        filter: none;
    }
    .dot:not([aria-current]):focus-visible::after {
        background: var(--color-ink);
    }
    @media (hover: hover) and (pointer: fine) {
        .stage:has(.prev:hover) .slide[data-prev='true'],
        .stage:has(.next:hover) .slide[data-next='true'] {
            opacity: 0.85;
            filter: none;
        }
        .slide[data-active='true']:hover::after {
            opacity: 0.85;
        }
        .dot:not([aria-current]):hover::after {
            background: var(--color-ink);
        }
    }
    @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
        .slide::after {
            transition: opacity 140ms ease-out;
        }
    }
    @container (max-width: 35rem) {
        .slide {
            width: calc(100% - 3rem);
            --spread: 48cqi;
            border-radius: 1rem;
        }
        .content {
            gap: 0.75rem;
            padding: 1.5rem;
        }
        .portrait :global(img),
        .portrait :global(span) {
            width: 2.5rem;
            height: 2.5rem;
        }
        .arrow {
            top: auto;
            bottom: 0;
            transform: none;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .slide {
            transition: none;
        }
    }
</style>
