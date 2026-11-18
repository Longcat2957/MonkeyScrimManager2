<script lang="ts">
    import { tick } from 'svelte';
    import { goto, invalidateAll } from '$app/navigation';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import SelectField from '#lib/components/common/SelectField.svelte';
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
    const labels = $derived(match.games.map((game) => `${game.order}세트`));
    const maxDamage = $derived(
        Math.max(
            0,
            ...(data.game?.sides.flatMap((side) =>
                side.players.flatMap((player) => [player.damage ?? 0, player.damageTaken ?? 0])
            ) ?? [])
        )
    );
    const remaining = $derived(Math.max(0, match.bestOf - match.games.length));
    const operation = $derived(data.operation);
    const lineupOperation = $derived('lineup' in operation ? operation : null);
    const sideOptions = $derived([
        { value: '', label: '팀 선택' },
        { value: 'a', label: match.teamA },
        { value: 'b', label: match.teamB }
    ]);
    let selectedSide = $state('');
    let editingSide = $state(false);
    let sideToggle = $state<HTMLButtonElement>();
    let savingSide = $state(false);
    let sideFailure = $state('');
    $effect(() => {
        selectedSide = operation.plannedBlueTeamSlot ?? '';
    });

    async function saveSide() {
        if (savingSide || !selectedSide || !operation.can.setSide) return;
        savingSide = true;
        try {
            sideFailure =
                (await postAction('setSide', {
                    expectedRevision: String(operation.revision),
                    nextGameNumber: String(operation.nextGameNumber),
                    blueTeamSlot: selectedSide
                })) ?? '';
        } finally {
            savingSide = false;
        }
        if (!sideFailure) {
            editingSide = false;
            await tick();
            sideToggle?.focus();
        }
    }
    const canRevertGame = $derived(
        lineupOperation?.can.revertResult && lineupOperation.latestGameId === data.game?.id
    );

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
        if (!lineupOperation?.latestGameId || reverting) return;
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
                    expectedRevision: String(lineupOperation.revision),
                    gameId: lineupOperation.latestGameId
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

{#snippet team(name: string, side: 'a' | 'b', score: number)}
    <span class={['flex min-w-0 items-baseline gap-2', side === 'a' && 'justify-end text-right']}>
        {#if side === 'b'}<strong class="font-brand text-3xl tabular-nums sm:text-4xl">{score}</strong>{/if}
        <span
            class={[
                'min-w-0 break-words text-ui font-bold sm:text-xl',
                winner && winner !== side && 'text-muted'
            ]}
        >
            {name}{#if winner === side}
                <small class="text-xs text-success">승리</small>{/if}
        </span>
        {#if side === 'a'}<strong class="font-brand text-3xl tabular-nums sm:text-4xl">{score}</strong>{/if}
    </span>
{/snippet}

<ScrimSummary scrim={data.scrim} {navigation} />

<div class="@container/record grid min-w-0 gap-3 sm:gap-4">
    <div
        class={[
            'grid min-w-0 items-start gap-2',
            match.status === 'in_progress' &&
                remaining > 0 &&
                '@min-[64rem]/record:grid-cols-[minmax(0,1fr)_minmax(16rem,0.4fr)]'
        ]}
    >
        <header class="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                <h2
                    class="grid min-w-0 max-w-full grid-cols-[minmax(0,auto)_auto_minmax(0,auto)] items-baseline gap-2"
                >
                    {@render team(match.teamA, 'a', match.scoreA)}
                    <span class="self-center text-lg text-muted"
                        ><span aria-hidden="true">:</span><span class="sr-only">대</span></span
                    >
                    {@render team(match.teamB, 'b', match.scoreB)}
                </h2>
                <p class="flex items-center gap-2 text-xs font-semibold text-ink-2">
                    <span>BO{match.bestOf}</span><StatusTag text={status.text} state={status.state} />
                </p>
            </div>
            {#if match.games.length > 1 || data.can.upload}
                <div
                    class={[
                        'flex min-w-0 items-center gap-2',
                        match.games.length > 1 && 'basis-full justify-between @min-[48rem]/record:basis-auto'
                    ]}
                >
                    {#if match.games.length > 1}
                        <div role="group" aria-label="세트 선택" class="min-w-0">
                            <SelectionTabs {labels} active={activeGame} onchange={selectGame} />
                        </div>
                    {/if}
                    {#if data.can.upload}
                        <Button
                            variant="primary"
                            disabled={remaining === 0}
                            onclick={() => (uploadOpen = true)}>ROFL 업로드</Button
                        >
                    {/if}
                </div>
            {/if}
        </header>
        {#if match.status === 'in_progress' && remaining > 0}
            <section
                aria-labelledby="next-set-sides"
                class="min-w-0 rounded-box border border-line bg-surface-2 px-3 py-1.5 sm:px-4"
            >
                <div class="flex min-h-8 items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <h3 id="next-set-sides" class="text-ui font-semibold">
                            {operation.nextGameNumber}세트 예정 진영
                        </h3>
                        <p class="min-w-0 break-words text-xs text-ink-2" aria-live="polite">
                            {#if operation.plannedBlueTeamSlot}
                                블루 {operation.plannedBlueTeamSlot === 'a' ? match.teamA : match.teamB} · 레드
                                {operation.plannedBlueTeamSlot === 'a' ? match.teamB : match.teamA}
                            {:else}
                                미정
                            {/if}
                        </p>
                    </div>
                    {#if operation.can.setSide}
                        <button
                            type="button"
                            bind:this={sideToggle}
                            aria-expanded={editingSide}
                            aria-controls="next-set-editor"
                            disabled={savingSide}
                            class="min-h-8 shrink-0 rounded-form px-2 text-xs font-semibold text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-45 pointer-coarse:min-h-11"
                            onclick={() => {
                                selectedSide = operation.plannedBlueTeamSlot ?? '';
                                sideFailure = '';
                                editingSide = !editingSide;
                            }}
                        >
                            {editingSide ? '설정 닫기' : '진영 설정'}
                        </button>
                    {/if}
                </div>
                {#if operation.can.setSide}
                    <form
                        id="next-set-editor"
                        hidden={!editingSide}
                        class="mt-1 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-line py-2 not-[hidden]:grid"
                        onsubmit={(event) => {
                            event.preventDefault();
                            saveSide();
                        }}
                    >
                        <SelectField
                            label="예정 블루 팀"
                            options={sideOptions}
                            bind:value={selectedSide}
                            disabled={savingSide}
                        />
                        <Button
                            type="submit"
                            loading={savingSide}
                            disabled={!selectedSide || selectedSide === operation.plannedBlueTeamSlot}
                            >진영 저장</Button
                        >
                        {#if sideFailure}<p role="alert" class="col-span-full text-sm text-error">
                                {sideFailure}
                            </p>{/if}
                    </form>
                {/if}
            </section>
        {/if}
    </div>

    {#if data.game}
        <section aria-labelledby="game-heading" class="flex min-w-0 flex-col gap-3" aria-busy={changing}>
            {#if changing}<p role="status" class="text-sm text-muted">세트를 불러오는 중</p>{/if}
            {#if canRevertGame || revertFailure || (lineupOperation?.blockedReason && lineupOperation.latestGameId === data.game.id)}
                <div class="flex flex-wrap items-center justify-end gap-2">
                    {#if revertFailure}<p role="alert" class="text-sm text-error">{revertFailure}</p>{/if}
                    {#if lineupOperation?.blockedReason && lineupOperation.latestGameId === data.game.id}
                        <p class="text-sm text-muted">결과 취소: {lineupOperation.blockedReason}</p>
                    {/if}
                    {#if canRevertGame}
                        <Button
                            variant="danger"
                            size="sm"
                            class="px-3"
                            loading={reverting}
                            onclick={revertResult}>마지막 세트 취소</Button
                        >
                    {/if}
                </div>
            {/if}
            <div class="panel overflow-hidden">
                <GameHero game={data.game} />
                <GameTeamTable
                    sides={data.game.sides}
                    lineup={lineupOperation?.lineup ?? null}
                    {guildId}
                    durationSec={data.game.durationSec}
                    {maxDamage}
                    ondetail={(player) => {
                        detailSelection = { gameId: data.game!.id, playerKey: player.key };
                        detailOpen = true;
                    }}
                />
            </div>
        </section>
    {/if}
    {#if lineupOperation && ['pending', 'in_progress'].includes(match.status)}
        <MatchLineupBoard operation={lineupOperation} />
    {/if}
    {#if !data.game}
        <SectionState state="empty" message="아직 기록된 세트가 없어요" />
    {/if}

    {#if data.usedChampions}
        <section aria-labelledby="fearless" class="panel">
            <h2 id="fearless" class="panel-bar font-bold">다음 세트에서 쓸 수 없는 챔피언</h2>
            <ul class="flex flex-wrap gap-2 p-3">
                {#each data.usedChampions as champion (champion.id)}
                    <li
                        class="flex items-center gap-1.5 rounded-(--radius-small) bg-surface-hover/60 py-1 pr-2 pl-1 text-xs"
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
        context={{
            max: lineupOperation ? 1 : Math.max(1, remaining),
            expectedRevision: operation.revision,
            expectedGameNumber: operation.nextGameNumber,
            lineupId: lineupOperation?.lineup?.id,
            plannedBlueTeamSlot: operation.plannedBlueTeamSlot,
            teamA: match.teamA,
            teamB: match.teamB
        }}
        onrecorded={recorded}
    />
{/if}
