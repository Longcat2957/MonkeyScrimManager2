<script lang="ts">
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { asset } from '$app/paths';

    type Count = { primary: number; secondary: number };

    let { counts, required }: { counts: Record<LolPosition, Count>; required: number } = $props();

    const ICON: Record<LolPosition, string> = {
        top: asset('riot/positions/top.svg'),
        jungle: asset('riot/positions/jungle.svg'),
        mid: asset('riot/positions/mid.svg'),
        bot: asset('riot/positions/bottom.svg'),
        support: asset('riot/positions/support.svg')
    };

    // 주 포지션이 팀 수를 넘으면 과밀, 주+부가 팀 수에 못 미치면 부족이다.
    const stateOf = (count: Count) =>
        count.primary > required ? 'over' : count.primary + count.secondary < required ? 'under' : 'ok';
</script>

<!-- 소환사의 협곡 5라인 전력 밸런스. 좁은 화면에서는 2·3열로 접어 글자가 겹치지 않게 한다. -->
<section
    class="flex flex-wrap gap-px overflow-hidden rounded-(--radius-box) border border-brass-line bg-brass-line"
    aria-label="선발 희망 포지션 분포"
>
    {#each POSITIONS as position (position.key)}
        {@const count = counts[position.key]}
        {@const state = stateOf(count)}
        <div
            class={[
                'flex min-w-[9rem] flex-1 items-center gap-2 bg-bg-surface px-3 py-2 dark:bg-bg-surface-dark',
                state === 'over' && 'bg-warning/10 dark:bg-warning/10'
            ]}
            title={`${position.text} 주 ${count.primary} · 부 ${count.secondary} / 팀 수 ${required}`}
        >
            <img src={ICON[position.key]} alt="" width="20" height="20" class="size-5 shrink-0" />
            <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-baseline justify-between gap-2">
                    <span class="text-sm font-semibold">{position.text}</span>
                    <span class="font-brand text-base font-bold">{count.primary + count.secondary}</span>
                </div>
                <div class="flex items-center justify-between gap-2 text-xs text-text-muted">
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
                                          : 'bg-brass-line'
                                ]}
                            ></span>
                        {/each}
                    </span>
                </div>
            </div>
        </div>
    {/each}
</section>
