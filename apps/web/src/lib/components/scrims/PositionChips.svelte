<script lang="ts">
    import { asset } from '$app/paths';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';

    // 전체 선택은 포지션 무관이며, 일부만 고르면 신청 순서의 첫 포지션을 강조한다.
    let { positions }: { positions: LolPosition[] } = $props();

    // Riot 공식 5포지션 심볼. 칩마다 인라인 SVG로 색을 토큰에 맞춘다.
    const ICON: Record<LolPosition, string> = {
        top: asset('riot/positions/top.svg'),
        jungle: asset('riot/positions/jungle.svg'),
        mid: asset('riot/positions/mid.svg'),
        bot: asset('riot/positions/bottom.svg'),
        support: asset('riot/positions/support.svg')
    };

    const text = (key: LolPosition) => POSITIONS.find((position) => position.key === key)?.text ?? key;
</script>

<span class="inline-flex flex-wrap items-center gap-1">
    {#if positions.length === POSITIONS.length}
        <span
            class="rounded-(--radius-small) border border-brass-line bg-bg-highlight px-1.5 py-0.5 text-xs leading-none text-text-muted dark:bg-bg-highlight-dark"
        >
            포지션 무관
        </span>
    {:else}
        {#each positions as position, index (position)}
            <span
                class={[
                    'inline-flex items-center gap-1 rounded-(--radius-small) border px-1.5 py-0.5 text-xs leading-none',
                    index === 0
                        ? 'border-brass bg-brass/10 font-semibold text-role-gold'
                        : 'border-brass-line bg-bg-highlight text-text-muted dark:bg-bg-highlight-dark'
                ]}
            >
                <img src={ICON[position]} alt="" width="12" height="12" class="size-3" />
                {text(position)}
            </span>
        {/each}
    {/if}
</span>
