<script lang="ts">
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionChips from '#lib/components/scrims/PositionChips.svelte';
    import { bestMmr, formatMmr, type FormationPlayer } from '#lib/features/scrims/formation.ts';
    import type { DragState } from './drag.svelte.ts';

    type Props = {
        players: FormationPlayer[];
        selectedId: string | null;
        interactive: boolean;
        drag: DragState;
        onselect: (participantId: string) => void;
    };

    let { players, selectedId, interactive, drag, onselect }: Props = $props();
</script>

<!-- 아직 자리가 없는 선발 참가자. 끌어서 자리에 놓거나 누른 뒤 자리를 누른다. 배치된 사람을 여기로 끌면 미배정이 된다. -->
<section
    aria-labelledby="formation-pool"
    class={[
        'flow-root transition-colors',
        drag.over === 'pool' ? 'bg-selected ring-2 ring-nexus ring-inset' : 'bg-surface-2'
    ]}
    ondragover={(event) => drag.enter(event, 'pool')}
    ondragleave={() => drag.leave('pool')}
    ondrop={(event) => drag.drop(event, 'pool')}
>
    <header class={players.length ? 'flex items-center justify-between gap-2 px-3 py-2.5' : 'sr-only'}>
        <h3 id="formation-pool" class="flex items-baseline gap-2 text-sm font-bold">
            미배정 <span class="text-xs font-semibold text-muted tabular-nums">{players.length}명</span>
        </h3>
        {#if interactive && players.length > 0 && !selectedId}
            <span class="text-xs text-muted">선택 후 자리 배치</span>
        {/if}
    </header>
    {#if players.length === 0}
        <p class="border border-dashed border-nexus bg-selected px-3 py-3 text-center text-ui">
            여기에 놓아 배정 해제
        </p>
    {:else}
        <ul
            class="grid max-h-48 gap-1.5 overflow-y-auto px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        >
            {#each players as player (player.participantId)}
                {#snippet content()}
                    <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
                    <span class="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                        <span class="max-w-full truncate text-sm font-semibold text-ink"
                            >{player.displayName}</span
                        >
                        <PositionChips positions={player.positions} />
                    </span>
                    <span
                        class="shrink-0 border-l border-line pl-2 text-right text-xs font-semibold text-ink-2 tabular-nums"
                    >
                        <span class="sr-only">MMR </span>{formatMmr(bestMmr(player))}
                    </span>
                {/snippet}
                <li class="min-w-0">
                    {#if interactive}
                        <button
                            type="button"
                            draggable="true"
                            aria-pressed={selectedId === player.participantId}
                            class={[
                                'flex min-h-12 w-full cursor-grab items-center gap-2 rounded-form border px-2 py-1.5 transition-colors active:cursor-grabbing',
                                drag.id === player.participantId && 'opacity-50',
                                selectedId === player.participantId
                                    ? 'border-nexus bg-selected ring-1 ring-nexus ring-inset'
                                    : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover'
                            ]}
                            ondragstart={(event) => drag.start(event, player.participantId)}
                            ondragend={() => drag.end()}
                            onclick={() => onselect(player.participantId)}
                        >
                            {@render content()}
                        </button>
                    {:else}
                        <span
                            class="flex min-h-12 items-center gap-2 rounded-form border border-line bg-surface px-2 py-1.5"
                            >{@render content()}</span
                        >
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</section>
