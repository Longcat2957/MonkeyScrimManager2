<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { AchievementRanking } from '#lib/features/players/achievements.ts';

    let { items, current = $bindable(0) }: { items: AchievementRanking[]; current?: number } = $props();

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

<!-- 업적 탐색은 사용자 데이터·키보드 제어가 필요해 서비스에서 직접 구성한다. -->
{#if item}
    <div
        role="group"
        aria-roledescription="캐러셀"
        aria-label="시즌 칭호"
        class="@container/title flex w-full min-w-0 flex-col overflow-hidden rounded-box border border-line bg-surface text-ink"
    >
        <div
            role="presentation"
            class="touch-pan-y"
            ontouchstart={swipeStart}
            ontouchend={swipeEnd}
            ontouchcancel={() => (touch = null)}
        >
            <div class="grid min-w-0 @min-[36rem]/title:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div class="border-s-4 border-role-gold px-4 py-5 @min-[36rem]/title:p-6">
                    <h3 class="text-2xl leading-tight font-bold tracking-tight break-keep wrap-anywhere">
                        {item.title}
                    </h3>
                    <p class="mt-2 text-ui text-ink-2">{item.description}</p>
                </div>
                <ul
                    aria-label="시즌 칭호 보유자"
                    class="grid content-center divide-y divide-line bg-surface-2 px-4"
                >
                    {#each item.entries.filter((entry) => entry.rank === 1) as winner (winner.userId)}
                        <li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                            <div class="flex min-w-0 flex-1 items-center gap-2">
                                <PlayerFace name={winner.displayName} imageUrl={winner.iconUrl} />
                                <div class="min-w-0">
                                    <p class="text-xs font-semibold text-role-gold">
                                        {winner.tied ? '공동 1위' : '1위'}
                                    </p>
                                    <p class="font-bold wrap-anywhere">{winner.displayName}</p>
                                </div>
                            </div>
                            <div class="text-end tabular-nums">
                                <p class="text-lg font-bold">{winner.value}</p>
                                <p class="text-xs text-ink-2">{winner.sample}{item.sampleUnit}</p>
                            </div>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
        <p class="sr-only" aria-live="polite" aria-atomic="true">
            {items.length}개 중 {current + 1}번째 칭호: {item.title}
        </p>
        {#if items.length > 1}
            <div class="flex min-w-0 items-center gap-1 border-t border-line px-1">
                <Button
                    variant="quiet"
                    ariaLabel="이전 칭호"
                    class="size-11! shrink-0 justify-center p-0!"
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
                </Button>
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (키보드로 가로 스크롤할 수 있는 이름 있는 영역이다.) -->
                <div
                    bind:this={selector}
                    role="region"
                    aria-label="칭호 바로 선택"
                    tabindex="0"
                    class="relative min-w-0 flex-1 overflow-x-auto overscroll-x-contain rounded-(--radius-small)"
                >
                    <ol class="flex w-max min-w-full gap-1">
                        {#each items as achievement, index (achievement.id)}
                            <li>
                                <button
                                    type="button"
                                    class={[
                                        'min-h-11 border-b-2 px-3 text-ui whitespace-nowrap',
                                        index === current
                                            ? 'border-nexus font-semibold text-ink'
                                            : 'border-transparent text-ink-2 hover:bg-surface-hover'
                                    ]}
                                    aria-label={`${index + 1}. ${achievement.title}`}
                                    aria-current={index === current ? 'true' : undefined}
                                    onclick={() => (current = index)}
                                >
                                    {achievement.title}
                                </button>
                            </li>
                        {/each}
                    </ol>
                </div>
                <Button
                    variant="quiet"
                    ariaLabel="다음 칭호"
                    class="size-11! shrink-0 justify-center p-0!"
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
                </Button>
            </div>
        {/if}
    </div>
{/if}
