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
    <span class="flex min-w-0 items-center gap-2">
        <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
        <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-semibold">{player.displayName}</span>
            <span class="flex items-center gap-2"
                ><PositionChips positions={player.positions} /><span class="text-xs opacity-60 tabular-nums"
                    >MMR {formatMmr(bestMmr(player))}</span
                ></span
            >
        </span>
    </span>
{/snippet}

{#snippet group(title: string, count: number, tone: string)}
    <div class="flex items-center justify-between">
        <h3 class={['text-xs font-semibold', tone]}>{title}</h3>
        <span class="text-xs opacity-60 tabular-nums">{count}명</span>
    </div>
{/snippet}

<Dialog bind:open title="후보 목록">
    <div class="flex flex-col gap-5">
        <section class="flex flex-col gap-2">
            {@render group('현재 후보', auction.openLot ? 1 : 0, 'text-primary dark:text-dark')}
            {#if auction.openLot}
                <div
                    class="flex flex-col gap-2 rounded-(--radius-small) border border-primary/30 bg-primary/5 p-2 dark:border-dark/30"
                >
                    {@render row(auction.openLot)}
                    {#if controls}
                        <div class="flex flex-wrap justify-end gap-1">
                            {#each auction.teams as team (team.id)}
                                <Button
                                    variant="secondary"
                                    size="auto"
                                    injClass="px-2 text-xs"
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
                <p
                    class="rounded-(--radius-small) bg-bg-highlight/50 px-3 py-2 text-sm opacity-60 dark:bg-bg-highlight-dark/50"
                >
                    현재 후보 없음
                </p>
            {/if}
        </section>

        <section class="flex flex-col gap-2">
            {@render group('대기', auction.queue.length, '')}
            <!-- 다음 후보는 이 순서대로 뽑힌다. -->
            <ol class="flex flex-col gap-1.5">
                {#each auction.queue as player, index (player.participantId)}
                    <li
                        class="flex items-center gap-2 rounded-(--radius-small) bg-bg-highlight/50 p-2 dark:bg-bg-highlight-dark/50"
                    >
                        <span class="w-5 text-right text-xs opacity-50 tabular-nums">{index + 1}</span>
                        {@render row(player)}
                    </li>
                {:else}
                    <li
                        class="rounded-(--radius-small) bg-bg-highlight/50 px-3 py-2 text-sm opacity-60 dark:bg-bg-highlight-dark/50"
                    >
                        대기 후보 없음
                    </li>
                {/each}
            </ol>
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
                                        size="auto"
                                        injClass="px-2 text-xs"
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
                                    size="auto"
                                    injClass="px-2 text-xs"
                                    disabled={busy || Boolean(auction.openLot)}
                                    onclick={() => onrestore(player.participantId)}
                                >
                                    다시 올리기<span class="sr-only">, {player.displayName}</span>
                                </Button>
                            </span>
                        {/if}
                    </li>
                {:else}
                    <li
                        class="rounded-(--radius-small) bg-bg-highlight/50 px-3 py-2 text-sm opacity-60 dark:bg-bg-highlight-dark/50"
                    >
                        유찰 후보 없음
                    </li>
                {/each}
            </ul>
        </section>
    </div>
</Dialog>
