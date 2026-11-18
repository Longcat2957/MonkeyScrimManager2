<script lang="ts">
    import type { LoadoutIcon } from '#lib/features/matches/types.ts';

    // 아이템·주문·룬 한 칸. 빈 칸은 같은 크기의 빈 상자로 자리를 유지한다. 이름은 alt·title로 준다.
    let {
        icon,
        size = 'md',
        round = false
    }: { icon: LoadoutIcon | null; size?: 'sm' | 'md'; round?: boolean } = $props();

    const SIZE = { sm: 'size-5', md: 'size-7' };
</script>

{#if icon?.iconUrl}
    <img
        src={icon.iconUrl}
        alt={icon.name}
        title={icon.name}
        loading="lazy"
        class={[
            'max-w-none shrink-0 bg-surface-hover object-cover',
            SIZE[size],
            round ? 'rounded-full' : 'rounded-(--radius-small)'
        ]}
    />
{:else if icon}
    <span
        title={icon.name}
        class={[
            'flex shrink-0 items-center justify-center rounded-(--radius-small) bg-surface-hover text-[0.5rem]',
            SIZE[size]
        ]}>{icon.name.slice(0, 2)}</span
    >
{:else}
    <span aria-hidden="true" class={['shrink-0 rounded-(--radius-small) bg-surface-hover/60', SIZE[size]]}
    ></span>
{/if}
