<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionChips from '#lib/components/scrims/PositionChips.svelte';
    import {
        bestMmr,
        formatMmr,
        TEAM_SIZE,
        type AuctionView,
        type FormationPlayer
    } from '#lib/features/scrims/formation.ts';

    type Props = {
        open: boolean;
        auction: AuctionView;
        controls: boolean;
        busy: boolean;
        onassign: (participantId: string, teamId: string) => void;
        onassignCurrent: (teamId: string) => void;
        onrestore: (participantId: string) => void;
    };

    let {
        open = $bindable(false),
        auction,
        controls,
        busy,
        onassign,
        onassignCurrent,
        onrestore
    }: Props = $props();
</script>

{#snippet row(player: FormationPlayer)}
    <span class="flex min-w-0 flex-1 items-center gap-2">
        <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
        <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-ui font-semibold">{player.displayName}</span>
            <PositionChips positions={player.positions} />
        </span>
        <span class="shrink-0 text-xs text-muted tabular-nums">MMR {formatMmr(bestMmr(player))}</span>
    </span>
{/snippet}

{#snippet group(title: string, count: number, tone: string)}
    <div class="flex items-center justify-between border-b border-line pb-1">
        <h3 class={['text-ui font-semibold', tone]}>{title}</h3>
        <span class="text-xs text-muted tabular-nums">{count}명</span>
    </div>
{/snippet}

<Dialog bind:open title="후보 목록">
    <div class="flex flex-col gap-5">
        <section class="flex flex-col gap-2">
            {@render group('현재 후보', auction.openLot ? 1 : 0, 'text-nexus')}
            {#if auction.openLot}
                <div
                    class="flex flex-col gap-2 rounded-(--radius-small) border border-nexus/30 bg-nexus/5 p-2"
                >
                    {@render row(auction.openLot)}
                    {#if controls}
                        <div class="flex flex-wrap justify-end gap-1">
                            {#each auction.teams as team (team.id)}
                                <Button
                                    variant="secondary"
                                    class="px-2 text-xs"
                                    disabled={busy || team.members.length >= TEAM_SIZE}
                                    onclick={() => onassignCurrent(team.id)}
                                >
                                    {team.name} 수동 배치<span class="sr-only"
                                        >, {auction.openLot.displayName}</span
                                    >
                                </Button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else}
                <p class="rounded-(--radius-small) bg-surface-hover/50 px-3 py-2 text-sm opacity-60">
                    현재 후보 없음
                </p>
            {/if}
        </section>

        <section class="flex flex-col gap-2">
            {@render group('대기 · 이름순', auction.queue.length, '')}
            <ul class="flex flex-col divide-y divide-line">
                {#each auction.queue as player (player.participantId)}
                    <li class="flex items-center gap-2 px-1 py-1.5">
                        {@render row(player)}
                    </li>
                {:else}
                    <li class="rounded-(--radius-small) bg-surface-hover/50 px-3 py-2 text-sm opacity-60">
                        대기 후보 없음
                    </li>
                {/each}
            </ul>
        </section>

        <section class="flex flex-col gap-2">
            {@render group('유찰 후보', auction.unsold.length, 'text-warning')}
            <ul class="flex flex-col gap-1.5">
                {#each auction.unsold as player (player.participantId)}
                    <li
                        class="flex flex-col gap-2 rounded-(--radius-small) border border-warning/20 bg-warning/5 p-2"
                    >
                        {@render row(player)}
                        {#if controls}
                            <span class="flex flex-wrap justify-end gap-1">
                                {#each auction.teams as team (team.id)}
                                    <Button
                                        variant="secondary"
                                        class="px-2 text-xs"
                                        disabled={busy ||
                                            Boolean(auction.openLot) ||
                                            team.members.length >= TEAM_SIZE}
                                        onclick={() => onassign(player.participantId, team.id)}
                                    >
                                        {team.name} 배치<span class="sr-only">, {player.displayName}</span>
                                    </Button>
                                {/each}
                                <Button
                                    variant="quiet"
                                    class="px-2 text-xs"
                                    disabled={busy || Boolean(auction.openLot)}
                                    onclick={() => onrestore(player.participantId)}
                                >
                                    다시 올리기<span class="sr-only">, {player.displayName}</span>
                                </Button>
                            </span>
                        {/if}
                    </li>
                {:else}
                    <li class="rounded-(--radius-small) bg-surface-hover/50 px-3 py-2 text-sm opacity-60">
                        유찰 후보 없음
                    </li>
                {/each}
            </ul>
        </section>
    </div>
</Dialog>
