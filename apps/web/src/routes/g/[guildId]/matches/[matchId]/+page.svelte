<script lang="ts">
    import { goto, invalidateAll } from '$app/navigation';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import GameHero from '#lib/components/matches/GameHero.svelte';
    import GamePlayerDialog from '#lib/components/matches/GamePlayerDialog.svelte';
    import GameTeamTable from '#lib/components/matches/GameTeamTable.svelte';
    import RoflUploadDialog from '#lib/components/matches/RoflUploadDialog.svelte';
    import MatchLineupBoard from '#lib/components/matches/MatchLineupBoard.svelte';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import { scrimNavItems } from '#lib/components/layout/navigation.ts';
    import { MATCH_STATUS } from '#lib/features/labels.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const guildId = $derived(page.params.guildId!);
    const changing = $derived(navigating.to?.route.id === page.route.id);
    const match = $derived(data.match);
    const navigation = $derived(scrimNavItems(guildId, data.scrim, page.url.pathname));
    const status = $derived(MATCH_STATUS[match.status]);
    // 정상 종료한 시리즈만 승자를 표시한다.
    const winner = $derived(
        match.status === 'completed' && match.scoreA !== match.scoreB
            ? match.scoreA > match.scoreB
                ? 'a'
                : 'b'
            : null
    );
    const activeGame = $derived(
        Math.max(
            0,
            match.games.findIndex((game) => game.id === data.game?.id)
        )
    );
    const labels = $derived(match.games.map((game) => ({ text: `${game.order}세트` })));
    const maxDamage = $derived(
        Math.max(
            0,
            ...(data.game?.sides.flatMap((side) =>
                side.players.flatMap((player) => [player.damage ?? 0, player.damageTaken ?? 0])
            ) ?? [])
        )
    );
    const remaining = $derived(Math.max(0, match.bestOf - match.games.length));

    let uploadOpen = $state(false);
    let detailOpen = $state(false);
    let detailSelection = $state<{ gameId: string; playerKey: string } | null>(null);
    // 공개 설정·결과를 새로 읽으면 열린 상세도 현재 자료를 사용한다.
    const detailPlayer = $derived(
        detailSelection?.gameId === data.game?.id
            ? (data.game?.sides
                  .flatMap((side) => side.players)
                  .find((player) => player.key === detailSelection?.playerKey) ?? null)
            : null
    );
    $effect(() => {
        if (detailOpen && !detailPlayer) detailOpen = false;
    });
    let reverting = $state(false);
    let revertFailure = $state('');

    async function revertResult() {
        if (!data.operation?.latestGameId || reverting) return;
        if (
            !(await confirm(
                '마지막 세트 결과와 MMR 반영을 취소할까요? 이후 경기나 점수가 변경됐다면 취소할 수 없어요.',
                '마지막 세트 취소'
            ))
        )
            return;
        reverting = true;
        try {
            revertFailure =
                (await postAction('revertResult', {
                    expectedRevision: String(data.operation.revision),
                    gameId: data.operation.latestGameId
                })) ?? '';
        } finally {
            reverting = false;
        }
    }

    function selectGame(index: number) {
        const url = new URL(page.url.href);
        url.searchParams.set('game', match.games[index]!.id);
        goto(url, { reset: false });
    }

    async function recorded(order: number | null) {
        await invalidateAll();
        const game = match.games.find((item) => item.order === order);
        if (game) selectGame(match.games.indexOf(game));
    }
</script>

<svelte:head>
    <title>{match.teamA} vs {match.teamB} · 경기 | {SERVICE_NAME}</title>
</svelte:head>

{#snippet team(name: string, side: 'a' | 'b')}
    <span
        class={[
            'min-w-0 text-base font-semibold break-words md:text-2xl',
            winner && winner !== side && 'text-text-muted'
        ]}
    >
        {name}{#if winner === side}<span class="sr-only"> 승리</span>{/if}
    </span>
{/snippet}

<ScrimSummary scrim={data.scrim} {navigation} />

<div class="flex flex-col gap-6">
    <!-- 시리즈 머리 -->
    <header class="flex flex-col gap-4">
        <h2 class="hex-panel grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 py-4">
            <span class="flex min-w-0 justify-end">{@render team(match.teamA, 'a')}</span>
            <span class="text-4xl font-black tabular-nums"
                >{match.scoreA} <span aria-hidden="true" class="opacity-40">:</span><span class="sr-only"
                    >대</span
                >
                {match.scoreB}</span
            >
            <span class="flex min-w-0">{@render team(match.teamB, 'b')}</span>
        </h2>
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-1">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span>BO{match.bestOf}</span>
                    <StatusTag text={status.text} state={status.state} />
                </p>
            </div>
            {#if data.can.upload}
                <Button
                    variant="primary"
                    injClass="min-h-11 px-4"
                    disabled={remaining === 0}
                    onclick={() => (uploadOpen = true)}>ROFL 업로드</Button
                >
            {/if}
        </div>
    </header>

    {#if data.operation && ['pending', 'in_progress'].includes(match.status)}
        <MatchLineupBoard operation={data.operation} />
    {/if}

    {#if !data.game}
        <SectionState state="empty" message="아직 기록된 세트가 없어요" />
    {:else}
        <section aria-labelledby="game-heading" class="flex flex-col gap-4" aria-busy={changing}>
            <h2 id="game-heading" class="sr-only">{data.game.order}세트</h2>
            {#if changing}<p role="status" class="text-sm text-text-muted">세트를 불러오는 중</p>{/if}
            {#if match.games.length > 1}
                <div role="group" aria-label="세트 선택" class="border-b border-brass-line">
                    <SelectionTabs {labels} active={activeGame} onclickTab={selectGame} />
                </div>
            {/if}
            {#if data.operation?.can.revertResult && data.operation.latestGameId === data.game.id}
                <div class="flex justify-end">
                    <Button
                        variant="danger"
                        size="sm"
                        injClass="min-h-11 px-3"
                        loading={reverting}
                        onclick={revertResult}>마지막 세트 취소</Button
                    >
                </div>
            {/if}
            {#if revertFailure}<p role="alert" class="text-sm text-error">{revertFailure}</p>{/if}
            {#if data.operation?.blockedReason && data.operation.latestGameId === data.game.id}
                <p class="text-sm text-text-muted">결과 취소: {data.operation.blockedReason}</p>
            {/if}
            <GameHero game={data.game} />
            {#each data.game.sides as side (side.side)}
                <GameTeamTable
                    {side}
                    {guildId}
                    durationSec={data.game.durationSec}
                    {maxDamage}
                    ondetail={(player) => {
                        detailSelection = { gameId: data.game!.id, playerKey: player.key };
                        detailOpen = true;
                    }}
                />
            {/each}
        </section>
    {/if}

    {#if data.usedChampions}
        <section aria-labelledby="fearless" class="flex flex-col gap-3">
            <h2 id="fearless" class="text-lg font-semibold">다음 세트에서 쓸 수 없는 챔피언</h2>
            <ul class="hex-panel flex flex-wrap gap-2 p-4">
                {#each data.usedChampions as champion (champion.id)}
                    <li
                        class="flex items-center gap-1.5 rounded-(--radius-small) bg-bg-highlight/60 py-1 pr-2 pl-1 text-xs dark:bg-bg-highlight-dark/60"
                    >
                        {#if champion.iconUrl}<img
                                src={champion.iconUrl}
                                alt=""
                                class="size-6 rounded-(--radius-small) grayscale"
                            />{/if}{champion.name}
                    </li>
                {/each}
            </ul>
        </section>
    {/if}
</div>

{#if data.game}
    <GamePlayerDialog bind:open={detailOpen} player={detailPlayer} durationSec={data.game.durationSec} />
{/if}
{#if data.can.upload}
    <RoflUploadDialog
        bind:open={uploadOpen}
        max={data.operation ? 1 : Math.max(1, remaining)}
        teams={data.operation?.teams ?? []}
        context={data.operation?.lineup
            ? {
                  expectedRevision: data.operation.revision,
                  expectedGameNumber: data.operation.nextGameNumber,
                  lineupId: data.operation.lineup.id
              }
            : undefined}
        onrecorded={recorded}
    />
{/if}
