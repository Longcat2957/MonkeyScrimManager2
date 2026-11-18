<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        formatMmr,
        LANES,
        occupantOf,
        slotKey,
        teamAverage,
        type Assignments,
        type FormationPlayer,
        type FormationTeam,
        type SlotKey
    } from '#lib/features/scrims/formation.ts';
    import type { DragState } from './drag.svelte.ts';

    type Props = {
        team: FormationTeam;
        players: FormationPlayer[];
        assignments: Assignments;
        // 놓을 자리를 고르는 중인 참가자다. 있으면 각 자리가 "여기에 배치" 버튼이 된다.
        selectedId: string | null;
        interactive: boolean;
        drag: DragState;
        details: boolean;
        onselect: (participantId: string) => void;
        onplace: (slot: SlotKey) => void;
        onremove: (participantId: string) => void;
    };

    let {
        team,
        players,
        assignments,
        selectedId,
        interactive,
        drag,
        details,
        onselect,
        onplace,
        onremove
    }: Props = $props();

    const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
    const playerOf = (id: string | null) =>
        id ? (players.find((player) => player.participantId === id) ?? null) : null;
    const average = $derived(teamAverage(team.id, players, assignments));
    const selectedName = $derived(playerOf(selectedId)?.displayName ?? '');
</script>

<!-- 팀 한 열: 머리 + 포지션 다섯 자리. 작업판 안에서 다른 열과 1px 경계로 붙는다. -->
<section aria-labelledby={`team-${team.id}`} class="flex min-w-0 flex-col bg-surface">
    <header class="flex h-13 items-center border-b border-line bg-surface-2 px-3">
        <div class="flex min-w-0 flex-col">
            <h3 id={`team-${team.id}`} class="truncate text-base leading-5 font-bold tracking-tight">
                {team.name}
            </h3>
            {#if details}
                <span class="text-xs text-muted"
                    >평균 <strong class="font-semibold text-ink-2 tabular-nums">{formatMmr(average)}</strong
                    ></span
                >
            {/if}
        </div>
    </header>

    <ol class="formation-lanes">
        {#each LANES as lane (lane)}
            {@const slot = slotKey(team.id, lane)}
            {@const player = playerOf(occupantOf(assignments, slot))}
            {@const targeting = interactive && selectedId !== null && selectedId !== player?.participantId}
            {@const offLane = player !== null && !player.positions.includes(lane)}
            <li
                role="group"
                aria-label={`${team.name} ${laneText(lane)} 자리`}
                class={[
                    'grid min-h-0 items-stretch gap-1 rounded-form border p-1 transition-colors',
                    interactive && !targeting
                        ? 'grid-cols-[1.75rem_minmax(0,1fr)_2.25rem] pointer-coarse:grid-cols-[1.75rem_minmax(0,1fr)_2.75rem]'
                        : 'grid-cols-[1.75rem_minmax(0,1fr)]',
                    drag.over === slot
                        ? 'border-nexus bg-selected ring-2 ring-nexus ring-inset'
                        : player
                          ? 'border-line bg-surface-2'
                          : 'border-dashed border-line-strong/60 bg-surface'
                ]}
                ondragover={(event) => drag.enter(event, slot)}
                ondragleave={() => drag.leave(slot)}
                ondrop={(event) => drag.drop(event, slot)}
            >
                <span class="flex items-center justify-center border-r border-line" title={laneText(lane)}>
                    <PositionIcon position={lane} size="md" />
                    <span class="sr-only">{laneText(lane)}</span>
                </span>

                {#snippet occupant(item: FormationPlayer)}
                    <PlayerFace name={item.displayName} imageUrl={item.iconUrl} size="sm" />
                    <span class="flex min-w-0 flex-1 flex-col text-left">
                        <span class="truncate text-sm leading-5 font-semibold text-ink"
                            >{item.displayName}</span
                        >
                        <span class="text-micro leading-4 text-muted">
                            MMR <span class="font-semibold text-ink-2 tabular-nums"
                                >{formatMmr(item.mmr[lane])}</span
                            >
                            {#if offLane}<span class="font-medium text-warning"> · 희망 외</span>{/if}
                        </span>
                    </span>
                {/snippet}

                {#if targeting}
                    <button
                        type="button"
                        class="flex min-w-0 items-center gap-1.5 rounded-small border border-dashed border-nexus/60 px-1.5 text-sm transition-colors hover:border-solid hover:border-nexus hover:bg-selected"
                        onclick={() => onplace(slot)}
                    >
                        {#if player}
                            {@render occupant(player)}
                            <span class="shrink-0 text-xs font-semibold text-nexus">교환</span>
                        {:else}
                            <span class="flex-1 text-center font-semibold text-nexus">여기에 배치</span>
                        {/if}
                        <span class="sr-only">, {selectedName} 배치 위치 {team.name} {laneText(lane)}</span>
                    </button>
                {:else if player && interactive}
                    <button
                        type="button"
                        draggable="true"
                        aria-pressed={selectedId === player.participantId}
                        class={[
                            'flex min-w-0 cursor-grab items-center gap-1.5 rounded-small px-1.5 transition-colors active:cursor-grabbing',
                            drag.id === player.participantId && 'opacity-50',
                            selectedId === player.participantId
                                ? 'bg-selected ring-2 ring-nexus ring-inset'
                                : 'hover:bg-surface-hover'
                        ]}
                        ondragstart={(event) => drag.start(event, player.participantId)}
                        ondragend={() => drag.end()}
                        onclick={() => onselect(player.participantId)}
                    >
                        {@render occupant(player)}
                    </button>
                {:else if player}
                    <span class="flex min-w-0 items-center gap-1.5 px-1.5">
                        {@render occupant(player)}
                    </span>
                {:else}
                    <span class="flex items-center justify-center text-ui text-muted">비어 있음</span>
                {/if}

                {#if interactive && !targeting}
                    <span class="flex items-center justify-center">
                        {#if player}
                            <Button
                                variant="quiet"
                                class="h-full w-full"
                                onclick={() => onremove(player.participantId)}
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 16 16"
                                    class="size-4 text-muted"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.5"
                                >
                                    <path d="m4 4 8 8m0-8-8 8" />
                                </svg>
                                <span class="sr-only">{player.displayName} 배정 해제</span>
                            </Button>
                        {/if}
                    </span>
                {/if}
            </li>
        {/each}
    </ol>
</section>
