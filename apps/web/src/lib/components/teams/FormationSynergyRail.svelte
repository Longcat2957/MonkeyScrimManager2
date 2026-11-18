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

<aside aria-label={`${team.name} 시너지`} class="flex min-w-0 flex-col bg-surface-2">
    <p
        class={[
            'flex min-w-0 items-center gap-1 text-xs font-semibold text-ink-2',
            compact ? 'border-t border-line px-3 py-2' : 'h-13 border-b border-line px-2'
        ]}
    >
        <span class="truncate" title={team.name}>{team.name}</span> <span class="shrink-0">시너지</span>
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
                    'flex min-w-0 flex-col justify-center gap-0.5 self-end rounded-small border px-1 py-1 text-center',
                    !record || !record.plays
                        ? 'border-transparent'
                        : record.wins * 2 >= record.plays
                          ? 'border-success/30 bg-surface'
                          : 'border-error/30 bg-surface'
                ]}
            >
                <span class="text-micro leading-tight font-medium text-ink-2"
                    >{laneText(laneA)}-{laneText(laneB)}</span
                >
                {#if record && record.plays}
                    <span
                        class={[
                            'text-sm leading-5 font-bold tabular-nums',
                            record.wins * 2 >= record.plays ? 'text-success' : 'text-error'
                        ]}
                    >
                        {record.wins}승 {record.plays - record.wins}패
                    </span>
                    <span class="text-micro leading-tight text-muted tabular-nums"
                        >{record.plays}판 · {winRate(record.plays, record.wins)}</span
                    >
                {:else}
                    <span class="text-xs text-muted">{a && b ? '기록 없음' : '-'}</span>
                {/if}
            </li>
        {/each}
    </ol>
</aside>
