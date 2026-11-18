<script lang="ts">
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';

    type Count = { primary: number; secondary: number };

    let { counts, required }: { counts: Record<LolPosition, Count>; required: number } = $props();

    // 주 포지션이 팀 수를 넘으면 과밀, 주+부가 팀 수에 못 미치면 부족이다.
    const stateOf = (count: Count) =>
        count.primary > required ? 'over' : count.primary + count.secondary < required ? 'under' : 'ok';
</script>

<!-- 소환사의 협곡 5라인 전력 밸런스. 좁은 화면에서는 2·3열로 접어 글자가 겹치지 않게 한다. -->
<section
    class="flex flex-wrap gap-px overflow-hidden rounded-(--radius-box) border border-line bg-line"
    aria-label="선발 희망 포지션 분포"
>
    {#each POSITIONS as position (position.key)}
        {@const count = counts[position.key]}
        {@const state = stateOf(count)}
        <div
            class={[
                'flex min-w-32 flex-1 items-center gap-2.5 px-3 py-2',
                state === 'over'
                    ? 'bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] text-warning'
                    : 'bg-surface text-ink'
            ]}
            title={`${position.text} 주 ${count.primary} · 부 ${count.secondary} / 팀 수 ${required}`}
        >
            <PositionIcon position={position.key} />
            <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-baseline justify-between gap-2">
                    <span class="text-ui font-semibold text-ink">{position.text}</span>
                    <span class="font-brand text-[15px] font-bold">{count.primary + count.secondary}명</span>
                </div>
                <div
                    class="flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5 text-micro text-muted"
                >
                    <span class="whitespace-nowrap">주 {count.primary} · 부 {count.secondary}</span>
                    <span class="flex shrink-0 gap-0.5" aria-hidden="true">
                        {#each Array(required) as _, index (index)}
                            <span
                                class={[
                                    'h-1 w-2 rounded-full',
                                    state === 'over'
                                        ? 'bg-warning'
                                        : count.primary + count.secondary > index
                                          ? 'bg-success'
                                          : 'bg-line'
                                ]}
                            ></span>
                        {/each}
                    </span>
                </div>
            </div>
        </div>
    {/each}
</section>
