<script lang="ts">
    import { Button } from 'stdf';
    import { resolve } from '$app/paths';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { AchievementRanking } from '#lib/features/players/achievements.ts';

    type Item = AchievementRanking & { splashUrl: string | null };

    // 업적 1위를 한 장씩 크게 보여 준다. 넓은 화면에서는 앞뒤 업적을 양옆에 흐리게 깔아 넘길 수 있음을 알린다.
    let {
        items,
        guildId,
        current = $bindable(0)
    }: { items: Item[]; guildId: string; current?: number } = $props();

    const at = (offset: number) => items[(current + offset + items.length) % items.length]!;
    const move = (offset: number) => (current = (current + offset + items.length) % items.length);

    // 터치 화면에서는 좌우로 밀어 넘긴다.
    let touchX: number | null = null;
    function swipeEnd(event: TouchEvent) {
        const dx = (event.changedTouches[0]?.clientX ?? 0) - (touchX ?? 0);
        if (touchX !== null && Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
        touchX = null;
    }
</script>

<!--
	STDF Swiper는 슬라이드에 데이터를 넘길 수 없고 키보드로 넘길 수단이 없어 직접 만든다.
	이전·다음은 STDF Button, 점은 해당 업적으로 바로 가는 버튼이다.
-->
{#snippet card(item: Item, active: boolean)}
    {@const winner = item.entries[0]!}
    <div
        class={[
            'relative isolate flex h-full items-center gap-5 overflow-hidden rounded-(--radius-box) bg-bg-base-dark p-5 text-text-dark sm:gap-8 sm:p-8',
            active
                ? 'border-2 border-warning shadow-[0_0_40px_-12px] shadow-warning'
                : 'border border-white/10'
        ]}
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
                    class="size-20 rounded-(--radius-box) border-2 border-warning sm:size-32"
                />
            {:else}
                <PlayerFace name={winner.displayName} imageUrl={null} size="lg" />
            {/if}
            <span
                aria-hidden="true"
                class="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-full bg-bg-base-dark text-xl ring-2 ring-warning"
                >{item.emoji}</span
            >
        </span>
        <span class="flex min-w-0 flex-col gap-1">
            <span class="text-2xl font-black text-warning sm:text-4xl">{item.title}</span>
            <span class="text-sm text-white/70">{item.description}</span>
            {#if active}
                <a
                    href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: winner.userId })}
                    class="mt-2 truncate text-xl font-bold hover:underline sm:text-2xl"
                    >{winner.displayName}</a
                >
            {:else}
                <span class="mt-2 truncate text-xl font-bold sm:text-2xl">{winner.displayName}</span>
            {/if}
            <span class="text-sm tabular-nums"
                ><span class="text-lg font-bold">{winner.value}</span>
                <span class="text-white/60">· {winner.games}게임</span></span
            >
        </span>
    </div>
{/snippet}

<div role="group" aria-roledescription="캐러셀" aria-label="업적" class="flex flex-col gap-3">
    <div
        role="presentation"
        class="relative"
        ontouchstart={(event) => (touchX = event.touches[0]?.clientX ?? null)}
        ontouchend={swipeEnd}
    >
        {#if items.length > 1}
            <!-- 양옆 카드는 장식이라 보조기기와 키보드에서 뺀다. -->
            <div
                aria-hidden="true"
                inert
                class="pointer-events-none absolute inset-y-6 left-0 hidden w-1/3 opacity-40 blur-[2px] lg:block"
            >
                {@render card(at(-1), false)}
            </div>
            <div
                aria-hidden="true"
                inert
                class="pointer-events-none absolute inset-y-6 right-0 hidden w-1/3 opacity-40 blur-[2px] lg:block"
            >
                {@render card(at(1), false)}
            </div>
        {/if}
        <div aria-live="polite" class="relative mx-auto h-44 w-full sm:h-64 lg:w-1/2">
            <span class="sr-only">{items.length}개 중 {current + 1}번째</span>
            {@render card(at(0), true)}
        </div>
        {#if items.length > 1}
            {#each [-1, 1] as offset (offset)}
                <span
                    class={[
                        'absolute top-1/2 -translate-y-1/2',
                        offset < 0 ? 'left-1 lg:left-4' : 'right-1 lg:right-4'
                    ]}
                >
                    <Button
                        fill="base"
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        radius="full"
                        injClass="size-11! justify-center bg-black/60! text-white! backdrop-blur-sm"
                        onclick={() => move(offset)}
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            aria-hidden="true"
                            ><path d={offset < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} /></svg
                        >
                        <span class="sr-only">{offset < 0 ? '이전 업적' : '다음 업적'}</span>
                    </Button>
                </span>
            {/each}
        {/if}
    </div>
    {#if items.length > 1}
        <ol class="flex flex-wrap justify-center">
            {#each items as item, index (item.id)}
                <li>
                    <button
                        type="button"
                        class="flex h-8 items-center px-1.5"
                        aria-label={item.title}
                        aria-current={index === current ? 'true' : undefined}
                        onclick={() => (current = index)}
                    >
                        <span
                            class={[
                                'block h-1.5 rounded-full transition-all',
                                index === current
                                    ? 'w-6 bg-warning'
                                    : 'w-1.5 bg-text-primary/25 dark:bg-text-dark/25'
                            ]}
                        ></span>
                    </button>
                </li>
            {/each}
        </ol>
    {/if}
</div>
