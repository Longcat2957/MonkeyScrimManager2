<script lang="ts">
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        headToHead,
        LANES,
        occupantOf,
        slotKey,
        type Assignments,
        type FormationPlayer,
        type FormationTeam,
        type PairRecord
    } from '#lib/features/scrims/formation.ts';

    type Props = {
        // 두 팀일 때만 쓴다. 같은 포지션끼리 지난 내전에서 맞붙은 전적을 왼쪽 팀 기준으로 보여 준다.
        teams: [FormationTeam, FormationTeam];
        players: FormationPlayer[];
        assignments: Assignments;
        pairs: Record<string, PairRecord>;
        compact?: boolean;
    };

    let { teams, players, assignments, pairs, compact = false }: Props = $props();

    const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
    const at = (teamId: string, lane: (typeof LANES)[number]) => {
        const id = occupantOf(assignments, slotKey(teamId, lane));
        return id ? (players.find((player) => player.participantId === id) ?? null) : null;
    };
</script>

<aside aria-labelledby="head-to-head" class="flex min-w-0 flex-col bg-surface-2">
    <div
        class={[
            'flex flex-col justify-center gap-0.5 px-1 text-center',
            compact ? 'py-2' : 'h-13 border-b border-line'
        ]}
    >
        <h3 id="head-to-head" class="text-xs leading-tight font-semibold text-ink-2">라인 상대 전적</h3>
        <p class="truncate text-micro text-muted" title={`${teams[0].name} 기준`}>{teams[0].name} 기준</p>
    </div>
    <ol class={compact ? 'grid grid-cols-5 gap-1 px-3 pb-3' : 'formation-lanes'}>
        {#each LANES as lane (lane)}
            {@const a = at(teams[0].id, lane)}
            {@const b = at(teams[1].id, lane)}
            {@const record = a && b ? headToHead(pairs, a.participantId, b.participantId, lane) : null}
            <li
                class={[
                    'flex min-w-0 flex-col items-center justify-center border-y text-center',
                    record ? 'border-line bg-surface' : 'border-transparent',
                    compact && 'min-h-16 gap-0.5 py-1'
                ]}
            >
                <span class={compact ? 'text-xs font-semibold text-ink-2' : 'sr-only'}>{laneText(lane)}</span>
                {#if record}
                    <span
                        class={[
                            'text-xs leading-none font-bold',
                            record.wins > record.losses && 'text-success',
                            record.wins < record.losses && 'text-error'
                        ]}
                        aria-hidden="true"
                    >
                        {record.wins > record.losses ? '>' : record.wins < record.losses ? '<' : '='}
                    </span>
                    <span class="font-brand text-base leading-5 font-bold tabular-nums"
                        >{record.wins}-{record.losses}</span
                    >
                    <span class="text-micro leading-tight text-muted">
                        {record.wins === record.losses
                            ? '동률'
                            : `${Math.abs(record.wins - record.losses)}승 ${record.wins > record.losses ? '우위' : '열세'}`}
                    </span>
                {:else}
                    <span class="text-xs text-muted">{a && b ? '맞대결 없음' : '-'}</span>
                {/if}
            </li>
        {/each}
    </ol>
</aside>
