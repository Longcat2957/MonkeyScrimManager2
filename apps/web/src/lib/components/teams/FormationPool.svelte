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
    class={['bg-surface transition', drag.over === 'pool' && 'ring-2 ring-nexus/40 ring-inset']}
    ondragover={(event) => drag.enter(event, 'pool')}
    ondragleave={() => drag.leave('pool')}
    ondrop={(event) => drag.drop(event, 'pool')}
>
    <header class="flex items-center justify-between px-3 py-2">
        <h3 id="formation-pool" class="text-sm font-semibold">
            미배정 <span class="text-xs font-normal text-muted tabular-nums">{players.length}명</span>
        </h3>
        {#if interactive && players.length > 0 && !selectedId}
            <span class="text-xs text-muted">선택 후 자리 배치</span>
        {/if}
    </header>
    {#if players.length === 0}
        {#if interactive}
            <p class="px-3 pb-3 text-center text-ui text-muted">배정 해제는 각 자리의 × 버튼을 사용해요</p>
        {/if}
    {:else}
        <ul
            class="grid max-h-48 gap-1 overflow-y-auto px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        >
            {#each players as player (player.participantId)}
                {#snippet content()}
                    <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
                    <span class="flex min-w-0 flex-1 flex-col text-left">
                        <span class="truncate text-ui font-semibold">{player.displayName}</span>
                        <PositionChips positions={player.positions} />
                    </span>
                    <span class="shrink-0 text-right text-xs text-muted tabular-nums">
                        <span class="sr-only">MMR </span>{formatMmr(bestMmr(player))}
                    </span>
                {/snippet}
                <li>
                    {#if interactive}
                        <button
                            type="button"
                            draggable="true"
                            aria-pressed={selectedId === player.participantId}
                            class={[
                                'flex min-h-11 w-full cursor-grab items-center gap-2 rounded-(--radius-small) border px-2 py-1 active:cursor-grabbing',
                                drag.id === player.participantId && 'opacity-50',
                                selectedId === player.participantId
                                    ? 'border-nexus bg-nexus/10 ring-2 ring-nexus/30 dark:bg-nexus/15'
                                    : 'border-line bg-surface-2 hover:border-line-strong hover:bg-surface-hover'
                            ]}
                            ondragstart={(event) => drag.start(event, player.participantId)}
                            ondragend={() => drag.end()}
                            onclick={() => onselect(player.participantId)}
                        >
                            {@render content()}
                        </button>
                    {:else}
                        <span
                            class="flex min-h-11 items-center gap-2 rounded-(--radius-small) border border-line bg-surface-2 px-2 py-1"
                            >{@render content()}</span
                        >
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</section>
