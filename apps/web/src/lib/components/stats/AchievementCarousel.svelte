<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PopoverMenu from '#lib/components/common/PopoverMenu.svelte';
    import type { AchievementRanking } from '#lib/features/players/achievements.ts';

    let { items, current = $bindable(0) }: { items: AchievementRanking[]; current?: number } = $props();

    const item = $derived(items[current] ?? items[0]);
    const winners = $derived(item?.entries.filter((entry) => entry.rank === 1) ?? []);
    let menuOpen = $state(false);
    const choices = $derived(
        items.map(({ title }, index) => ({ content: title, current: index === current }))
    );

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
{#if item && winners[0]}
    <div
        role="group"
        aria-roledescription="캐러셀"
        aria-label="시즌 칭호"
        class="@container/title min-w-0 border-y border-line-strong text-ink"
    >
        <div
            role="presentation"
            class="touch-pan-y"
            ontouchstart={swipeStart}
            ontouchend={swipeEnd}
            ontouchcancel={() => (touch = null)}
        >
            <div
                class="flex items-center gap-4 bg-surface-2 px-4 py-6 @min-[30rem]/title:gap-6 @min-[30rem]/title:px-6"
            >
                <svg
                    aria-hidden="true"
                    viewBox="0 0 80 90"
                    fill="none"
                    class="w-14 shrink-0 text-role-gold @min-[30rem]/title:w-20"
                >
                    <path
                        d="m5 30 26 10 9 39-22-21zM75 30 49 40l-9 39 22-21z"
                        fill="currentColor"
                        opacity=".18"
                    />
                    <path
                        d="m5 30 17 19 9 3M75 30 58 49l-9 3M15 52l12 13 13 8 13-8 12-13"
                        stroke="currentColor"
                        stroke-width="2"
                    />
                    <path d="M40 5 60 30 40 61 20 30Z" stroke="currentColor" stroke-width="2" />
                    <path d="m40 13 13 18-13 21-13-21z" fill="currentColor" />
                    <path d="m40 13 13 18-13 21 4-21z" fill="var(--color-surface-2)" opacity=".55" />
                </svg>
                <div class="min-w-0">
                    <h3
                        class="text-[clamp(1.5rem,5.8cqi,2.5rem)] leading-tight font-bold tracking-tight text-balance break-keep wrap-anywhere"
                    >
                        {item.title}
                    </h3>
                    <p class="mt-2 text-ui break-keep text-ink-2">{item.description}</p>
                </div>
            </div>
            <div class="px-4 pt-4 pb-3 @min-[30rem]/title:px-6">
                <div class="flex flex-wrap items-baseline gap-x-2.5">
                    <strong class="text-xl font-bold text-role-gold tabular-nums">{winners[0].value}</strong>
                    <span class="text-xs font-semibold text-ink-2">
                        {winners[0].tied ? `공동 1위 · ${winners.length}명` : '1위'}
                    </span>
                </div>
                <ul
                    aria-label="시즌 칭호 보유자"
                    class="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-x-4 gap-y-2.5"
                >
                    {#each winners as winner (winner.userId)}
                        <li class="flex min-w-0 items-center gap-2">
                            <PlayerFace name={winner.displayName} imageUrl={winner.iconUrl} />
                            <div class="min-w-0">
                                <p class="text-ui font-semibold wrap-anywhere">{winner.displayName}</p>
                                <p class="text-xs text-muted tabular-nums">
                                    {winner.sample}{item.sampleUnit}
                                </p>
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
            <div class="flex items-center gap-1 border-t border-line px-2 @min-[30rem]/title:px-4">
                <div class="relative me-auto">
                    <Button
                        variant="quiet"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onclick={() => (menuOpen = !menuOpen)}
                    >
                        <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"><path d="M2 4h12M2 8h12M2 12h8" /></svg
                        >
                        칭호 목록
                    </Button>
                    <PopoverMenu
                        bind:open={menuOpen}
                        label="칭호 바로 선택"
                        actions={choices}
                        side="up"
                        onselect={(index) => (current = index)}
                    />
                </div>
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
                <span aria-hidden="true" class="text-xs text-muted tabular-nums"
                    >{current + 1} / {items.length}</span
                >
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
