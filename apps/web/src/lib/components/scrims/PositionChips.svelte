<script lang="ts">
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';

    // 전체 선택은 포지션 무관이며, 일부만 고르면 신청 순서의 첫 포지션을 강조한다.
    let { positions }: { positions: LolPosition[] } = $props();

    const text = (key: LolPosition) => POSITIONS.find((position) => position.key === key)?.text ?? key;
</script>

<span class="inline-flex flex-wrap items-center gap-1">
    {#if positions.length === POSITIONS.length}
        <span
            class="rounded-(--radius-small) border border-line bg-surface-hover px-1.5 py-0.5 text-xs leading-none text-muted"
        >
            포지션 무관
        </span>
    {:else}
        {#each positions as position, index (position)}
            <span
                class={[
                    'inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-small border bg-surface-2 pr-2 pl-1.5 text-xs leading-tight font-semibold',
                    index === 0 ? 'border-role-gold text-ink' : 'border-line text-ink-2'
                ]}
            >
                <PositionIcon {position} size="sm" />
                {text(position)}
            </span>
        {/each}
    {/if}
</span>
