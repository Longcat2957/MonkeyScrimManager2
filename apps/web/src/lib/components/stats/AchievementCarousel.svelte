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
        <!-- 컨테이너는 자기 자신을 조회할 수 없으므로 배치 격자는 안쪽에 둔다. -->
        <div class="frame">
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
                            <header class="caption">
                                <h3 class="title text-lg font-bold @min-[35rem]:text-xl">{entry.title}</h3>
                                <p class="mt-1 text-sm leading-relaxed text-pretty break-keep text-ink-2">
                                    {entry.description}
                                </p>
                            </header>
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
                            <div class="result min-w-0">
                                {#if winners[0]}
                                    <p class="flex flex-wrap items-baseline gap-x-2">
                                        <strong class="font-brand text-lg font-semibold tabular-nums"
                                            >{winners[0].value}</strong
                                        >
                                        <span class="text-xs text-muted">
                                            {winners[0].tied ? `공동 1위 · ${winners.length}명` : '1위'}
                                        </span>
                                    </p>
                                {/if}
                                <ul
                                    aria-label="시즌 칭호 보유자"
                                    class="mt-2 grid gap-x-4 gap-y-1 @min-[35rem]:grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]"
                                >
                                    {#each winners as winner (winner.userId)}
                                        <li class="flex flex-wrap items-baseline gap-x-2">
                                            <b class="text-sm font-semibold wrap-anywhere"
                                                >{winner.displayName}</b
                                            >
                                            <span class="text-xs whitespace-nowrap text-muted tabular-nums"
                                                >{winner.sample}{entry.sampleUnit}</span
                                            >
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        </div>
                    </article>
                {/each}
            </div>
            {#if items.length > 1}
                {#each [-1, 1] as direction (direction)}
                    <div class={['arrow', direction < 0 ? 'prev' : 'next']}>
                        <Button
                            variant="secondary"
                            ariaLabel={direction < 0 ? '이전 칭호' : '다음 칭호'}
                            class="size-11! p-0!"
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
            <p class="sr-only" aria-live="polite" aria-atomic="true">
                {items.length}개 중 {current + 1}번째 칭호: {item.title}
            </p>
            {#if items.length > 1}
                <div role="group" aria-label="칭호 바로 선택" class="dots flex flex-wrap justify-center">
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
    </div>
{/if}

<style>
    /* 주변 패널과 같은 괘선·모서리·표면을 쓰고, 칭호마다 다른 것은 챔피언 스플래시뿐이다. */
    .deck {
        container-type: inline-size;
    }
    .frame {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas: 'stage stage stage' '. dots .';
    }
    .stage {
        grid-area: stage;
        padding-block: 0.25rem;
    }
    .dots {
        grid-area: dots;
    }
    .slide {
        --spread: min(21cqi, 18rem);
        grid-area: 1 / 1;
        position: relative;
        isolation: isolate;
        display: grid;
        align-content: center;
        width: min(36rem, calc(100% - 6rem));
        min-height: clamp(12rem, 18cqi, 14.5rem);
        overflow: hidden;
        border: 1px solid var(--color-line);
        border-radius: var(--radius-box);
        background: var(--color-surface-2);
        color: var(--color-ink);
        transform: translateX(calc(var(--offset) * var(--spread))) scale(calc(1 - var(--depth) * 0.075));
        z-index: calc(3 - var(--depth));
        transition:
            transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 240ms;
    }
    .slide[data-active='true'] {
        border-color: var(--color-line-strong);
    }
    .slide[data-active='false'] {
        opacity: 0.4;
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
    /* 글자가 놓이는 왼쪽은 표면색으로 덮고 오른쪽에만 스플래시가 비친다. 두 테마 모두 같은 토큰을 쓴다. */
    .slide::after {
        content: '';
        background: linear-gradient(
            90deg,
            color-mix(in oklab, var(--color-surface-2) 96%, transparent) 0 42%,
            color-mix(in oklab, var(--color-surface-2) 80%, transparent)
        );
    }
    .content {
        display: grid;
        grid-template: 'portraits caption' auto 'portraits result' auto / auto minmax(0, 1fr);
        gap: 0.75rem 1rem;
        padding: 1.25rem clamp(1rem, 2.5cqi, 1.5rem);
    }
    .caption {
        grid-area: caption;
        min-width: 0;
    }
    .result {
        grid-area: result;
    }
    .portraits {
        display: grid;
        grid-area: portraits;
        align-self: center;
        gap: 0.375rem;
    }
    .portrait :global(img),
    .portrait :global(span) {
        border-radius: var(--radius-form);
        outline: 1px solid var(--color-line);
    }
    .title {
        line-height: 1.25;
        text-wrap: balance;
        word-break: keep-all;
        overflow-wrap: anywhere;
    }
    .arrow {
        grid-area: stage;
        align-self: center;
        z-index: 4;
    }
    .arrow.prev {
        justify-self: start;
        margin-inline-start: 0.25rem;
    }
    .arrow.next {
        justify-self: end;
        margin-inline-end: 0.25rem;
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
        background: var(--color-line-strong);
    }
    .dot[aria-current='true']::after {
        width: 1.15rem;
        background: var(--color-nexus);
    }
    .frame:has(.prev :global(button:focus-visible)) .slide[data-prev='true'],
    .frame:has(.next :global(button:focus-visible)) .slide[data-next='true'] {
        opacity: 0.85;
    }
    .dot:not([aria-current]):focus-visible::after {
        background: var(--color-ink);
    }
    @media (hover: hover) and (pointer: fine) {
        .frame:has(.prev:hover) .slide[data-prev='true'],
        .frame:has(.next:hover) .slide[data-next='true'] {
            opacity: 0.85;
        }
        .dot:not([aria-current]):hover::after {
            background: var(--color-ink);
        }
    }
    /* 좁으면 화살표가 카드 모서리를 가리지 않도록 점과 한 행에 둔다. */
    @container (max-width: 35rem) {
        .frame {
            grid-template-areas: 'stage stage stage' 'prev dots next';
            align-items: center;
        }
        .arrow.prev,
        .arrow.next {
            grid-area: auto;
            margin: 0;
        }
        .arrow.prev {
            grid-area: prev;
        }
        .arrow.next {
            grid-area: next;
        }
        .slide {
            width: calc(100% - 3rem);
            --spread: 48cqi;
        }
        .content {
            grid-template-areas: 'caption caption' 'portraits result';
            gap: 0.75rem;
            padding: 1rem 1.125rem;
        }
        .portrait :global(img),
        .portrait :global(span) {
            width: 2.5rem;
            height: 2.5rem;
        }
        /* 칭호 15개가 화살표 사이 한 줄에 들어가는 폭이다. 같은 이동은 화살표로도 할 수 있다. */
        .dot {
            width: 0.875rem;
        }
        .dot[aria-current='true']::after {
            width: 0.75rem;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .slide {
            transition: none;
        }
    }
</style>
