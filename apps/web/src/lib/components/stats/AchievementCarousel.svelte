<script lang="ts">
    import { Button } from 'stdf';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { AchievementRanking } from '#lib/features/players/achievements.ts';

    type Item = AchievementRanking & { splashUrl: string | null };

    let { items, current = $bindable(0) }: { items: Item[]; current?: number } = $props();

    const item = $derived(items[current] ?? items[0]);
    let selector: HTMLDivElement | null = $state(null);

    function move(offset: number) {
        if (items.length > 1) current = (current + offset + items.length) % items.length;
    }

    // 선택 표시만 가로로 따라가며 페이지의 세로 읽기 위치는 유지한다.
    $effect(() => {
        const index = current;
        const target = selector?.querySelectorAll('button')[index];
        if (selector && target)
            selector.scrollLeft = target.offsetLeft - (selector.clientWidth - target.offsetWidth) / 2;
    });

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

<!-- STDF Swiper는 사용자 데이터·키보드 제어 API가 없어 업적 탐색만 서비스에서 구성한다. -->
{#if item}
    {@const winner = item.entries[0]!}
    <div
        role="group"
        aria-roledescription="캐러셀"
        aria-label="업적"
        class="mx-auto flex w-full max-w-3xl flex-col gap-3"
    >
        <div
            role="presentation"
            class="touch-pan-y"
            ontouchstart={swipeStart}
            ontouchend={swipeEnd}
            ontouchcancel={() => (touch = null)}
        >
            <div
                class="inverse-surface relative isolate flex min-h-52 items-center gap-5 overflow-hidden rounded-(--radius-box) border border-warning bg-bg-base-dark p-5 text-text-dark sm:min-h-64 sm:gap-8 sm:p-8"
            >
                {#if item.splashUrl}
                    <img
                        src={item.splashUrl}
                        alt=""
                        loading="lazy"
                        class="absolute inset-0 -z-10 size-full object-cover object-[50%_20%] opacity-25"
                    />
                    <span
                        class="absolute inset-0 -z-10 bg-linear-to-r from-bg-base-dark via-bg-base-dark/80 to-bg-base-dark/40"
                    ></span>
                {/if}
                <span class="relative shrink-0">
                    {#if winner.iconUrl}
                        <img
                            src={winner.iconUrl}
                            alt=""
                            width="128"
                            height="128"
                            class="size-20 rounded-(--radius-box) border border-warning sm:size-32"
                        />
                    {:else}
                        <PlayerFace name={winner.displayName} imageUrl={null} size="lg" />
                    {/if}
                    <span
                        aria-hidden="true"
                        class="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-full bg-bg-base-dark text-xl ring-1 ring-warning"
                        >{item.emoji}</span
                    >
                </span>
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 class="text-2xl font-bold text-balance text-warning sm:text-4xl">{item.title}</h3>
                    <p class="text-sm text-white/80">{item.description}</p>
                    <p class="mt-2 text-xl font-bold sm:text-2xl">{winner.displayName}</p>
                    <p class="text-sm tabular-nums">
                        <span class="text-lg font-bold">{winner.value}</span>
                        <span class="text-white/75">· {winner.games}게임</span>
                    </p>
                </div>
            </div>
        </div>
        <p class="sr-only" aria-live="polite" aria-atomic="true">
            {items.length}개 중 {current + 1}번째 업적: {item.title}
        </p>
        {#if items.length > 1}
            <div class="flex min-w-0 items-center gap-2">
                <Button
                    fill="lineLight"
                    size="auto"
                    heightOut="0"
                    heightIn="2"
                    injClass="size-11! shrink-0 justify-center"
                    onclick={() => move(-1)}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg
                    >
                    <span class="sr-only">이전 업적</span>
                </Button>
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (키보드로 가로 스크롤할 수 있는 이름 있는 영역이다.) -->
                <div
                    bind:this={selector}
                    role="region"
                    aria-label="업적 바로 선택"
                    tabindex="0"
                    class="relative min-w-0 flex-1 overflow-x-auto overscroll-x-contain rounded-(--radius-small)"
                >
                    <ol class="flex w-max min-w-full justify-center">
                        {#each items as achievement, index (achievement.id)}
                            <li>
                                <button
                                    type="button"
                                    class="flex size-11 items-center justify-center"
                                    aria-label={`${index + 1}. ${achievement.title}`}
                                    aria-current={index === current ? 'true' : undefined}
                                    onclick={() => (current = index)}
                                >
                                    <span
                                        aria-hidden="true"
                                        class={[
                                            'block h-1.5 rounded-full',
                                            index === current
                                                ? 'w-6 bg-warning'
                                                : 'w-1.5 bg-primary/70 dark:bg-dark/50'
                                        ]}
                                    ></span>
                                </button>
                            </li>
                        {/each}
                    </ol>
                </div>
                <Button
                    fill="lineLight"
                    size="auto"
                    heightOut="0"
                    heightIn="2"
                    injClass="size-11! shrink-0 justify-center"
                    onclick={() => move(1)}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg
                    >
                    <span class="sr-only">다음 업적</span>
                </Button>
            </div>
        {/if}
    </div>
{/if}
