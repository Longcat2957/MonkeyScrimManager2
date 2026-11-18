<script lang="ts">
    import { onMount, untrack, type Snippet } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { toast } from '#lib/ui/toast.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        formatMmr,
        TEAM_SIZE,
        winRate,
        type AuctionView,
        type Celebration,
        auctionStories
    } from '#lib/features/scrims/formation.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { bracketPath } from '#lib/features/scrims/paths.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import AuctionTargetProfile from './AuctionTargetProfile.svelte';
    import AuctionTeamCard from './AuctionTeamCard.svelte';
    import CandidateListDialog from './CandidateListDialog.svelte';
    import ChangeMethodButton from './ChangeMethodButton.svelte';
    import { DragState } from './drag.svelte.ts';

    let {
        auction,
        manager,
        refreshAction,
        refreshing = false
    }: { auction: AuctionView; manager: boolean; refreshAction?: Snippet; refreshing?: boolean } = $props();

    // 입찰가를 조정할 때마다 다시 차는 진행자용 타이머다. 결과를 강제하지 않는 안내용이다.
    const TIMER_MS = 10_000;

    let bids = $state<Record<string, string>>({});
    let busy = $state(false);
    let timerStart = $state(Date.now());
    let now = $state(Date.now());
    let details = $state(false);
    let listOpen = $state(false);
    let candidateHeight = $state(0);
    // 낙찰·수동 배치가 끝난 팀 패널에 잠깐 보여 줄 축하 효과다.
    let celebration = $state<Celebration | null>(null);
    let celebrationTimer: ReturnType<typeof setTimeout> | undefined;

    const live = $derived(auction.status === 'in_progress');
    const controls = $derived(manager && live);
    const open = $derived(auction.openLot);
    const lotKey = $derived(auction.openLotId ?? open?.participantId ?? null);
    const profile = $derived(auction.openProfile);
    // 이야기 문구 앞의 이모지는 아이콘 문법에 맞지 않아 걷어 낸다.
    const stories = $derived(auctionStories(auction).map((story) => story.replace(/^[^\p{L}\p{N}]+/u, '')));
    const canRevert = $derived(auction.canRevert ?? auction.history.some((entry) => !entry.voided));
    const canReset = $derived(auction.history.some((entry) => !entry.voided));
    const remainingMs = $derived(Math.min(TIMER_MS, Math.max(0, TIMER_MS - (now - timerStart))));
    const mainLane = $derived(open?.positions[0] ?? profile?.mainLane ?? null);
    const recentWins = $derived(profile?.recentGames.filter((game) => game.win).length ?? 0);
    const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
    const STATUS = {
        setup: { text: '준비', state: 'theme' },
        in_progress: { text: '진행 중', state: 'warning' },
        completed: { text: '완료', state: 'success' },
        cancelled: { text: '취소', state: 'error' }
    } as const;
    const RESULT = { sold: '낙찰', unsold: '유찰', manual: '수동 배치' } as const;

    // 현재 매물이나 유찰 후보를 팀 패널로 끌어 놓으면 가격 없이 배치한다.
    const drag = new DragState({
        enabled: () => controls && !busy,
        accepts: (id, teamId) => {
            const team = auction.teams.find((item) => item.id === teamId);
            const movable =
                id === open?.participantId ||
                (!open && auction.unsold.some((player) => player.participantId === id));
            return Boolean(team && team.members.length < TEAM_SIZE && movable);
        },
        ondrop: (id, teamId) => (id === open?.participantId ? assignCurrent(teamId) : assign(id, teamId))
    });

    // 후보가 바뀌거나 입찰가가 바뀌면 타이머를 다시 채운다.
    $effect(() => {
        if (!open) details = false;
        void open?.participantId;
        void JSON.stringify(bids);
        timerStart = Date.now();
    });

    // 새 후보에게 이전 후보의 입찰가를 적용하지 않는다. 같은 후보의 재조회에는 입력을 유지한다.
    $effect(() => {
        void lotKey;
        untrack(() => {
            bids = {};
            clearTimeout(celebrationTimer);
            celebration = null;
        });
    });

    onMount(() => {
        const interval = setInterval(() => (now = Date.now()), 200);
        return () => {
            clearInterval(interval);
            clearTimeout(celebrationTimer);
        };
    });

    async function run(name: string, fields: Record<string, string> = {}) {
        if (busy || refreshing || !controls) return false;
        busy = true;
        try {
            const message = await postAction(name, {
                ...fields,
                ...(auction.openLotId ? { lotId: auction.openLotId } : {})
            });
            if (message) toast.error(message);
            else if (auction.status === 'completed')
                await goto(
                    bracketPath({ guildId: page.params.guildId!, scrimId: page.params.scrimId! }, 'ready')
                );
            return !message;
        } finally {
            busy = false;
        }
    }

    function celebrate(teamId: string, participantId: string, label: string) {
        if (auction.status === 'completed') return;
        clearTimeout(celebrationTimer);
        celebration = { teamId, participantId, label, key: Date.now() };
        celebrationTimer = setTimeout(() => (celebration = null), 1800);
    }

    async function award(teamId: string, price: number) {
        const target = open?.participantId;
        if (await run('award', { teamId, price: String(price) })) {
            bids = {};
            if (target) celebrate(teamId, target, `낙찰! ${price}P`);
        }
    }

    async function assignCurrent(teamId: string) {
        const target = open?.participantId;
        if ((await run('assignCurrent', { teamId })) && target) celebrate(teamId, target, '낙찰!');
    }

    async function assign(participantId: string, teamId: string) {
        if (await run('assign', { participantId, teamId })) celebrate(teamId, participantId, '낙찰!');
    }

    async function draw() {
        if (await run('draw')) bids = {};
    }

    async function revert() {
        if (
            await confirm(
                '마지막 경매 작업을 되돌릴까요? 추첨·유찰·배치 전 상태로 돌아가며 되돌린 이력은 남아요.',
                '마지막 작업 되돌리기'
            )
        )
            await run('revert');
    }

    async function reset() {
        if (
            await confirm(
                '낙찰·유찰·수동 배치를 모두 되돌리고 팀장과 시작 포인트만 남긴 처음 상태로 돌아갈까요?',
                '경매 초기화'
            )
        )
            await run('reset');
    }

    async function reopenSetup() {
        if (
            await confirm(
                '낙찰·유찰·수동 배치를 무효화하고 팀장·시작 포인트 설정으로 돌아갈까요?',
                '팀장 다시 정하기'
            )
        )
            await run('reopenSetup');
    }
</script>

<section
    aria-labelledby="auction-board"
    aria-busy={busy || refreshing}
    class="auction-board flex w-full min-w-0 flex-col gap-2"
    style:--candidate-height={`${open ? candidateHeight : 0}px`}
>
    <header class="page-head border-b border-line pb-2">
        <div class="flex shrink-0 items-center gap-2">
            <h2 id="auction-board" class="text-base font-bold">경매</h2>
            <StatusTag text={STATUS[auction.status].text} state={STATUS[auction.status].state} />
            {#if busy || refreshing}<Spinner />{/if}
        </div>
        <div class="flex flex-wrap items-center gap-1">
            {@render refreshAction?.()}
            {#if controls}
                <!-- 진행 중에도 앞 단계로 돌아갈 수 있다. 기존 경매 기록은 무효화해 보존한다. -->
                <Button variant="quiet" class="px-3 text-ui" disabled={busy} onclick={reopenSetup}
                    >팀장 다시 정하기</Button
                >
                <ChangeMethodButton disabled={busy} />
            {/if}
        </div>
    </header>

    {#if controls && open}
        <p class="text-ui text-muted">입찰가를 바꾸면 10초를 다시 세며, 낙찰·유찰은 직접 결정해요.</p>
    {/if}

    <!-- 작업판: 왼쪽 현재 매물·후보 현황, 오른쪽 팀 패널. 1px 경계로 붙는다. -->
    <div
        class={[
            'panel overflow-clip xl:bg-line',
            live &&
                'grid gap-px xl:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)_auto]',
            live && (auction.teams.length > 2 ? 'xl:h-[52rem]' : 'xl:h-[clamp(32rem,70svh,40rem)]')
        ]}
    >
        {#if live}
            <div class="contents xl:col-start-1 xl:row-start-1 xl:block xl:min-h-0">
                <!-- 현재 매물 -->
                <section
                    aria-labelledby="open-lot"
                    class="contents xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:bg-surface"
                >
                    <div
                        class="flex flex-wrap items-center justify-between gap-1 border-b border-line bg-surface px-3 py-2"
                    >
                        <div class="flex items-center gap-2">
                            <h3 id="open-lot" class="text-base font-semibold">현재 매물</h3>
                            {#if open}<span class="size-2 rounded-full bg-success" aria-hidden="true"
                                ></span>{/if}
                        </div>
                        <div class="flex flex-wrap items-center justify-end gap-0.5">
                            {#if controls && canRevert}
                                <Button
                                    variant="quiet"
                                    class="px-2 text-ui text-warning"
                                    disabled={busy}
                                    onclick={revert}>되돌리기</Button
                                >
                            {/if}
                            {#if open && profile}
                                <Button
                                    variant={details ? 'secondary' : 'quiet'}
                                    class="px-2 text-ui"
                                    onclick={() => (details = !details)}>상세보기</Button
                                >
                            {/if}
                            {#if controls}
                                <Button
                                    variant={!open && auction.queue.length > 0 ? 'primary' : 'quiet'}
                                    class="px-2 text-ui"
                                    disabled={busy || Boolean(open) || auction.queue.length === 0}
                                    onclick={draw}>다음 후보</Button
                                >
                            {/if}
                        </div>
                    </div>

                    <div
                        class="contents xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:gap-2 xl:overflow-y-auto xl:p-2"
                    >
                        {#if open}
                            <!-- 운영자는 이 카드를 팀 패널로 끌어 가격 없이 배치할 수 있다. -->
                            <div
                                bind:clientHeight={candidateHeight}
                                role="group"
                                aria-label={`현재 매물 ${open.displayName}`}
                                draggable={controls}
                                class={[
                                    'panel sticky top-(--app-header-height) z-20 isolate mx-2 flex shrink-0 flex-col overflow-hidden px-3 py-2 xl:relative xl:top-auto xl:z-auto xl:mx-0 xl:p-3',
                                    details ? 'gap-2' : 'justify-between gap-2 xl:min-h-[15rem] xl:gap-3',
                                    controls && 'cursor-grab active:cursor-grabbing',
                                    drag.id === open.participantId
                                        ? 'border-nexus bg-selected opacity-70'
                                        : 'border-line-strong bg-surface-2'
                                ]}
                                ondragstart={(event) => drag.start(event, open.participantId)}
                                ondragend={() => drag.end()}
                            >
                                {#if !details && mainLane}
                                    <span
                                        class="pointer-events-none absolute top-3 right-3 opacity-15"
                                        aria-hidden="true"
                                        ><PositionIcon position={mainLane} size="md" /></span
                                    >
                                {/if}
                                <div class="flex items-start justify-between gap-3">
                                    <span
                                        class="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 text-xs font-semibold text-role-gold"
                                    >
                                        {#if mainLane}
                                            <PositionIcon position={mainLane} size="sm" />{open.positions
                                                .length
                                                ? '희망'
                                                : '주력'}
                                            {laneText(mainLane)}
                                        {:else}
                                            포지션 미확인
                                        {/if}
                                    </span>
                                    {#if profile?.riot?.tier}
                                        <span
                                            class="rounded-sm border border-line px-1.5 py-0.5 text-xs font-semibold text-role-gold"
                                            >{profile.riot.tier}</span
                                        >
                                    {/if}
                                </div>
                                <div
                                    class={[
                                        'flex items-center gap-3',
                                        details ? 'flex-row' : 'xl:flex-col xl:text-center'
                                    ]}
                                >
                                    <PlayerFace name={open.displayName} imageUrl={open.iconUrl} size="md" />
                                    <div class="min-w-0">
                                        <p class="text-lg font-bold wrap-anywhere xl:text-title">
                                            {open.displayName}
                                        </p>
                                        <p class="text-ui font-medium text-muted tabular-nums">
                                            MMR {formatMmr(mainLane ? open.mmr[mainLane] : null)}
                                        </p>
                                    </div>
                                </div>
                                {#if profile && !details && profile.summary.games}
                                    <div class="grid grid-cols-3 gap-px bg-line">
                                        {#each [['승률', winRate(profile.summary.games, profile.summary.wins)], ['승패', `${profile.summary.wins}-${profile.summary.losses}`], [profile.recentChronologyKnown === false ? '표시 기록' : '최근', `${recentWins}승 ${profile.recentGames.length - recentWins}패`]] as [label, value] (label)}
                                            <div class="bg-surface px-2 py-1 text-center">
                                                <p class="text-micro text-muted">{label}</p>
                                                <p class="text-ui font-semibold tabular-nums">{value}</p>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                                {#if controls}
                                    {@const seconds = Math.ceil(remainingMs / 1000)}
                                    <!-- 남은 초 기준: 10~7초 녹색, 6~3초 주황, 3초 미만 빨간색 -->
                                    {@const tone =
                                        seconds >= 7 ? 'success' : seconds >= 3 ? 'warning' : 'error'}
                                    <div
                                        aria-hidden="true"
                                        class="relative h-6 w-full overflow-hidden rounded-(--radius-small) bg-surface-hover"
                                    >
                                        <div
                                            class={[
                                                'h-full transition-[width,background-color] duration-200 ease-linear',
                                                {
                                                    success: 'bg-success',
                                                    warning: 'bg-warning',
                                                    error: 'bg-error'
                                                }[tone]
                                            ]}
                                            style:width="{(remainingMs / TIMER_MS) * 100}%"
                                        ></div>
                                        <span
                                            class={[
                                                'absolute inset-y-0 right-0 flex items-center bg-surface-hover px-3 text-sm font-bold tabular-nums',
                                                seconds > 0 && tone === 'error' && 'text-error'
                                            ]}>{seconds > 0 ? `${seconds}초` : '조정 시간 종료'}</span
                                        >
                                    </div>
                                {/if}
                            </div>
                            {#if details && profile}
                                <div class="bg-surface p-3 xl:contents">
                                    <AuctionTargetProfile player={open} {profile} />
                                </div>
                            {/if}
                        {:else}
                            <div
                                class="flex min-h-36 flex-1 flex-col items-center justify-center gap-1 border border-dashed border-line bg-surface px-4 py-4 text-center"
                            >
                                <p class="font-semibold text-muted">후보 대기</p>
                                <p class="text-sm text-muted">
                                    {auction.queue.length
                                        ? controls
                                            ? '다음 후보를 뽑아 입찰을 시작해요'
                                            : '다음 후보를 기다리고 있어요'
                                        : controls
                                          ? '대기 후보가 없어요. 후보 목록에서 유찰 후보를 배치하거나 다시 올려 주세요'
                                          : '대기 중인 후보가 없어요'}
                                </p>
                            </div>
                        {/if}
                    </div>
                    {#if controls && open}
                        <!-- 유찰은 현재 매물 칸 하단에 고정해 카드 길이와 상관없이 같은 자리에 둔다. -->
                        <div class="flex justify-end bg-surface px-3 pb-3">
                            <Button
                                variant="quiet"
                                class="px-2 text-ui text-warning"
                                disabled={busy}
                                onclick={() => run('pass')}>유찰</Button
                            >
                        </div>
                    {/if}
                </section>
            </div>
        {/if}

        <!-- 팀 패널 -->
        <div
            class={[
                'grid min-h-0 gap-px md:grid-cols-2',
                auction.teams.length > 2 && 'md:grid-rows-2',
                live && 'xl:col-start-2 xl:row-span-2 xl:row-start-1'
            ]}
        >
            {#each auction.teams as team (team.id)}
                <AuctionTeamCard
                    {team}
                    bidding={controls && Boolean(open)}
                    {busy}
                    {drag}
                    bind:bid={() => bids[team.id] ?? '', (value) => (bids[team.id] = value)}
                    celebration={celebration?.teamId === team.id ? celebration : null}
                    onaward={(price) => award(team.id, price)}
                />
            {/each}
        </div>
        {#if live}
            <!-- 후보 현황 -->
            <section
                aria-labelledby="candidates"
                class="flex flex-col gap-2 bg-surface p-3 xl:col-start-1 xl:row-start-2"
            >
                <div class="flex items-center justify-between">
                    <h3 id="candidates" class="text-base font-semibold">후보 현황</h3>
                    <span class="text-xs opacity-60 tabular-nums"
                        >{(open ? 1 : 0) + auction.queue.length + auction.unsold.length}명</span
                    >
                </div>
                <div class={['grid gap-1', controls ? 'sm:grid-cols-3' : 'grid-cols-1']}>
                    <Button variant="secondary" class="w-full" onclick={() => (listOpen = true)}
                        >후보 목록</Button
                    >
                    {#if controls}
                        <Button
                            variant="secondary"
                            class="w-full"
                            disabled={busy || auction.queue.length < 2}
                            onclick={() => run('shuffle')}>순서 섞기</Button
                        >
                        <Button variant="danger" class="w-full" disabled={busy || !canReset} onclick={reset}
                            >초기화</Button
                        >
                    {/if}
                </div>
                <div class="grid grid-cols-3 gap-px bg-line text-center">
                    {#each [['현재', open ? 1 : 0, 'text-nexus'], ['대기', auction.queue.length, ''], ['유찰 후보', auction.unsold.length, 'text-warning']] as [label, value, tone] (label)}
                        <div class="bg-surface px-2 py-1">
                            <p class="text-micro text-muted">{label}</p>
                            <p class={['text-ui font-semibold tabular-nums', tone]}>{value}</p>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}
    </div>

    {#if stories.length}
        <div class="panel px-3 py-2" role="region" aria-label="경매 이야기">
            <p class="text-xs font-semibold text-muted">경매 이야기</p>
            <ul class="mt-1 flex flex-col gap-0.5 text-sm">
                {#each stories as story (story)}<li>{story}</li>{/each}
            </ul>
        </div>
    {/if}

    {#if auction.history.length}
        <details class="panel group overflow-hidden">
            <summary
                class="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-ui font-semibold marker:content-none pointer-coarse:min-h-11"
            >
                <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    class="size-4 text-muted transition-transform group-open:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <path d="m6 4 4 4-4 4" />
                </svg>
                경매 기록 ({auction.history.length})
            </summary>
            <div class="overflow-x-auto border-t border-line">
                <table class="data-table">
                    <caption class="sr-only">경매 기록</caption>
                    <thead>
                        <tr>
                            <th scope="col" class="py-2 text-right font-medium">순서</th>
                            <th scope="col" class="px-3 py-2 text-left font-medium">후보</th>
                            <th scope="col" class="px-3 py-2 text-left font-medium">결과</th>
                            <th scope="col" class="px-3 py-2 text-left font-medium">팀</th>
                            <th scope="col" class="py-2 text-right font-medium">가격</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each auction.history as entry (entry.id)}
                            <tr class={['border-t border-line', entry.voided && 'opacity-50']}>
                                <td class="py-2 text-right tabular-nums">{entry.order}</td>
                                <td class={['px-3 py-2', entry.voided && 'line-through']}
                                    >{entry.displayName}</td
                                >
                                <td class="px-3 py-2"
                                    >{RESULT[entry.result]}{entry.voided ? ' (되돌림)' : ''}</td
                                >
                                <td class="px-3 py-2">{entry.teamName ?? '-'}</td>
                                <td class="py-2 text-right tabular-nums"
                                    >{entry.price === null ? '-' : `${entry.price}P`}</td
                                >
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </details>
    {/if}
</section>

{#if live}
    <CandidateListDialog
        bind:open={listOpen}
        {auction}
        {controls}
        {busy}
        onassign={assign}
        onassignCurrent={assignCurrent}
        onrestore={(participantId) => run('restore', { participantId })}
    />
{/if}

<style>
    @media (width < 80rem) {
        .auction-board :global(button) {
            scroll-margin-block-start: var(--candidate-height);
        }

        /* 입찰 입력으로 이동할 때 팀 이름이 포함된 제목도 고정 후보 아래에 남긴다. */
        .auction-board :global(input) {
            scroll-margin-block-start: calc(var(--candidate-height) + 2rem);
        }
    }
</style>
