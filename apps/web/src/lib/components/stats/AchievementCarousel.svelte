<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
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

<!-- 업적 탐색은 사용자 데이터·키보드 제어가 필요해 서비스에서 직접 구성한다. -->
{#if item}
    {@const winner = item.entries[0]!}
    <div
        role="group"
        aria-roledescription="캐러셀"
        aria-label="업적"
        class="flex w-full min-w-0 flex-col gap-2"
    >
        <div
            role="presentation"
            class="touch-pan-y"
            ontouchstart={swipeStart}
            ontouchend={swipeEnd}
            ontouchcancel={() => (touch = null)}
        >
            <div
                class="inverse-surface relative isolate flex flex-col gap-4 overflow-hidden rounded-box border border-line bg-ground p-4 text-ink"
            >
                {#if item.splashUrl}
                    <img
                        src={item.splashUrl}
                        alt=""
                        loading="lazy"
                        class="absolute inset-0 -z-10 size-full object-cover object-[50%_20%] opacity-60"
                    />
                    <span class="absolute inset-0 -z-10 bg-linear-to-t from-ground via-ground/80 to-ground/50"
                    ></span>
                {/if}
                <div class="min-w-0">
                    <h3 class="text-lg font-bold text-balance">{item.title}</h3>
                    <p class="mt-1 text-ui text-ink/85">{item.description}</p>
                </div>
                <div class="flex min-w-0 items-center gap-3 border-t border-white/20 pt-3">
                    <PlayerFace name={winner.displayName} imageUrl={winner.iconUrl} size="lg" />
                    <div class="min-w-0 flex-1">
                        <p class="text-base font-bold wrap-anywhere">
                            <span class="text-xs text-role-gold">1위</span>
                            {winner.displayName}
                        </p>
                        <p class="text-ui tabular-nums">
                            <span class="font-bold">{winner.value}</span>
                            <span class="text-ink/80">· {winner.games}게임</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
        <p class="sr-only" aria-live="polite" aria-atomic="true">
            {items.length}개 중 {current + 1}번째 업적: {item.title}
        </p>
        {#if items.length > 1}
            <div class="flex min-w-0 items-center gap-2">
                <Button
                    variant="secondary"
                    ariaLabel="이전 업적"
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
                                            index === current ? 'w-6 bg-nexus' : 'w-1.5 bg-line'
                                        ]}
                                    ></span>
                                </button>
                            </li>
                        {/each}
                    </ol>
                </div>
                <Button
                    variant="secondary"
                    ariaLabel="다음 업적"
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
