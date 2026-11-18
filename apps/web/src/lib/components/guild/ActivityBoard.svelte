<script lang="ts">
    import { untrack } from 'svelte';
    import { resolve } from '$app/paths';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import MatchListRow from '#lib/components/matches/MatchListRow.svelte';
    import ScrimListRow from '#lib/components/scrims/ScrimListRow.svelte';
    import type { MatchListItem } from '#lib/features/matches/types.ts';
    import type { ScrimListItem } from '#lib/features/scrims/types.ts';
    import type { SectionResult } from '#lib/features/section.ts';

    type Props = {
        guildId: string;
        activeScrims: SectionResult<ScrimListItem[]>;
        recentMatches: SectionResult<MatchListItem[]>;
        nextShown: boolean;
        onretry: () => Promise<void>;
    };

    let { guildId, activeScrims, recentMatches, nextShown, onretry }: Props = $props();

    // 처음 열 때 진행 중인 내전이 없으면 최근 경기부터 보여 준다. 이후 탭은 사용자가 고른 대로 둔다.
    let active = $state(untrack(() => (activeScrims.ok && activeScrims.value.length === 0 ? 1 : 0)));
    const labels = $derived([
        activeScrims.ok ? `진행 중 ${activeScrims.value.length}` : '진행 중',
        '최근 경기'
    ]);
</script>

<section
    aria-labelledby="activity"
    class="min-w-0 border-t border-line @min-[46rem]:border-s @min-[46rem]:border-t-0"
>
    <div class="panel-bar">
        <h2 id="activity" class="text-base font-semibold">내전 현황</h2>
        <div role="group" aria-label="보기 선택" class="min-w-0">
            <SelectionTabs {labels} {active} onchange={(index) => (active = index)} />
        </div>
    </div>

    {#if active === 0}
        {#if !activeScrims.ok}
            <div class="p-3">
                <SectionState state="error" message="내전을 불러오지 못했어요" {onretry} />
            </div>
        {:else if activeScrims.value.length === 0}
            <p class="px-3 py-8 text-center text-sm text-muted">
                {nextShown ? '다른 진행 중인 내전이 없어요' : '진행 중인 내전이 없어요'}
            </p>
        {:else}
            <ul aria-label="진행 중인 내전" class="divide-y divide-line">
                {#each activeScrims.value as scrim (scrim.id)}
                    <li>
                        <ScrimListRow
                            {scrim}
                            href={resolve('/g/[guildId]/scrims/[scrimId]', {
                                guildId,
                                scrimId: scrim.id
                            })}
                        />
                    </li>
                {/each}
            </ul>
        {/if}
    {:else if !recentMatches.ok}
        <div class="p-3">
            <SectionState state="error" message="경기 기록을 불러오지 못했어요" {onretry} />
        </div>
    {:else if recentMatches.value.length === 0}
        <p class="px-3 py-8 text-center text-sm text-muted">아직 기록된 경기가 없어요</p>
    {:else}
        <ul aria-label="최근 경기" class="divide-y divide-line">
            {#each recentMatches.value as match (match.id)}
                <li>
                    <MatchListRow
                        {match}
                        href={resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.id })}
                        line={false}
                    />
                </li>
            {/each}
        </ul>
    {/if}
</section>
