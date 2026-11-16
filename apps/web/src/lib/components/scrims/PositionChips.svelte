<script lang="ts">
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';

    // 전체 선택은 포지션 무관이며, 일부만 고르면 신청 순서의 첫 포지션을 강조한다.
    let { positions }: { positions: LolPosition[] } = $props();

    const text = (key: LolPosition) => POSITIONS.find((position) => position.key === key)?.text ?? key;
</script>

<span class="inline-flex flex-wrap justify-end gap-1">
    {#if positions.length === POSITIONS.length}
        <span
            class="rounded-(--radius-small) bg-bg-highlight px-1.5 py-0.5 text-xs leading-none text-text-muted dark:bg-bg-highlight-dark"
        >
            포지션 무관
        </span>
    {:else}
        {#each positions as position, index (position)}
            <span
                class={[
                    'rounded-(--radius-small) px-1.5 py-0.5 text-xs leading-none',
                    index === 0
                        ? 'bg-primary/10 font-semibold text-primary dark:bg-dark/15 dark:text-dark'
                        : 'bg-bg-highlight text-gray-600 dark:bg-bg-highlight-dark dark:text-gray-300'
                ]}
            >
                {text(position)}
            </span>
        {/each}
    {/if}
</span>
