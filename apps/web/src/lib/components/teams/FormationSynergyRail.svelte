<script lang="ts">
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        LANES,
        occupantOf,
        pairKey,
        slotKey,
        SYNERGY_PAIRS,
        winRate,
        type Assignments,
        type FormationPlayer,
        type FormationTeam,
        type PairRecord
    } from '#lib/features/scrims/formation.ts';

    // 팀 열 옆에 붙는 시너지 레일. 포지션 쌍의 위쪽 자리 줄에 맞춰 같은 팀 전적을 보여 준다.
    type Props = {
        team: FormationTeam;
        players: FormationPlayer[];
        assignments: Assignments;
        pairs: Record<string, PairRecord>;
        compact?: boolean;
    };
    let { team, players, assignments, pairs, compact = false }: Props = $props();

    const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
    const at = (lane: (typeof LANES)[number]) => {
        const id = occupantOf(assignments, slotKey(team.id, lane));
        return id ? (players.find((player) => player.participantId === id) ?? null) : null;
    };
    const rowOf = (lane: string) => LANES.indexOf(lane as (typeof LANES)[number]) + 1;
</script>

<aside aria-label={`${team.name} 시너지`} class="flex min-w-0 flex-col bg-surface">
    <p class={['flex items-center text-xs font-semibold text-muted', compact ? 'px-3 py-2' : 'h-11 px-2']}>
        {team.name} 시너지
    </p>
    <ol class={compact ? 'grid grid-cols-3 gap-1 px-3 pb-3' : 'formation-lanes'}>
        {#each SYNERGY_PAIRS as [laneA, laneB] (`${laneA}-${laneB}`)}
            {@const a = at(laneA)}
            {@const b = at(laneB)}
            {@const record = a && b ? pairs[pairKey(a.participantId, b.participantId)]?.together : null}
            <!-- 두 자리 사이에 걸치도록 위 자리 줄 아래쪽에 붙인다. -->
            <li
                style:grid-row={compact ? undefined : rowOf(laneA)}
                class={[
                    'flex flex-col justify-center self-end rounded-(--radius-small) border px-1 py-0.5 text-center',
                    !record || !record.plays
                        ? 'border-line'
                        : record.wins * 2 >= record.plays
                          ? 'border-success/40 bg-success/5'
                          : 'border-error/40 bg-error/5'
                ]}
            >
                <span class="text-[0.6875rem] opacity-60">{laneText(laneA)}-{laneText(laneB)}</span>
                {#if record && record.plays}
                    <span
                        class={[
                            'text-sm font-semibold tabular-nums',
                            record.wins * 2 >= record.plays ? 'text-success' : 'text-error'
                        ]}
                    >
                        {record.wins}승 {record.plays - record.wins}패
                    </span>
                    <span class="text-[0.6875rem] opacity-60 tabular-nums"
                        >{record.plays}판 · {winRate(record.plays, record.wins)}</span
                    >
                {:else}
                    <span class="text-xs opacity-50">{a && b ? '기록 없음' : '-'}</span>
                {/if}
            </li>
        {/each}
    </ol>
</aside>
