<script lang="ts">
    import { onMount, type Snippet } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { toast } from '#lib/ui/toast.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { formatMmr, TEAM_SIZE, winRate, type AuctionView } from '#lib/features/scrims/formation.ts';
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

    const live = $derived(auction.status === 'in_progress');
    const controls = $derived(manager && live);
    const open = $derived(auction.openLot);
    const lotKey = $derived(auction.openLotId ?? open?.participantId ?? null);
    const profile = $derived(auction.openProfile);
    const canRevert = $derived(auction.canRevert ?? auction.history.some((entry) => !entry.voided));
    const canReset = $derived(auction.history.some((entry) => !entry.voided));
    const fullyAssigned = $derived(
        auction.teams.length > 0 && auction.teams.every((team) => team.members.length === TEAM_SIZE)
    );
    const remainingMs = $derived(Math.min(TIMER_MS, Math.max(0, TIMER_MS - (now - timerStart))));
    const seconds = $derived(Math.ceil(remainingMs / 1000));
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
        if (!lotKey) details = false;
        void JSON.stringify(bids);
        timerStart = Date.now();
    });

    // 새 후보에게 이전 후보의 입찰가를 적용하지 않는다. 같은 후보의 재조회에는 입력을 유지한다.
    $effect(() => {
        void lotKey;
        bids = {};
    });

    onMount(() => {
        const interval = setInterval(() => (now = Date.now()), 200);
        return () => clearInterval(interval);
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

    async function award(teamId: string, price: number) {
        if (await run('award', { teamId, price: String(price) })) bids = {};
    }

    async function assignCurrent(teamId: string) {
        await run('assignCurrent', { teamId });
    }

    async function assign(participantId: string, teamId: string) {
        if (await run('assign', { participantId, teamId })) listOpen = false;
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

    async function confirmFormation() {
        if (await confirm('현재 팀과 경매 기록을 그대로 확정하고 대진으로 이동할까요?', '경매 편성 확정'))
            await run('confirmFormation');
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
            <h2 id="auction-board" class="text-lg font-bold tracking-tight">경매</h2>
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
        <p class="text-ui leading-relaxed text-ink-2">
            입찰가를 바꾸면 10초를 다시 세며, 낙찰·유찰은 직접 결정해요.
        </p>
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
                        class="flex flex-wrap items-center justify-between gap-1 border-b border-line bg-surface-2 px-3 py-2"
                    >
                        <div class="flex items-center gap-2">
                            <h3 id="open-lot" class="text-base font-bold tracking-tight">현재 매물</h3>
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
                                    aria-expanded={details}
                                    class="px-2 text-ui"
                                    onclick={() => (details = !details)}>상세보기</Button
                                >
                            {/if}
                            {#if controls && !fullyAssigned}
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
                                    'bg-selected',
                                    drag.id === open.participantId
                                        ? 'border-nexus opacity-70'
                                        : 'border-nexus/40'
                                ]}
                                ondragstart={(event) => drag.start(event, open.participantId)}
                                ondragend={() => drag.end()}
                            >
                                {#if controls}
                                    <div class="-mx-3 -mt-2 xl:-mt-3">
                                        <div
                                            role="progressbar"
                                            aria-label="남은 입찰 조정 시간"
                                            aria-valuemin={0}
                                            aria-valuemax={TIMER_MS / 1000}
                                            aria-valuenow={seconds}
                                            aria-valuetext={seconds ? `${seconds}초` : '조정 시간 종료'}
                                            class="h-1.5 overflow-hidden bg-line"
                                        >
                                            {#key timerStart}
                                                <div
                                                    class="clock-fill h-full origin-left"
                                                    style:--duration={`${TIMER_MS}ms`}
                                                    style:transform={`scaleX(${seconds / (TIMER_MS / 1000)})`}
                                                    class:running={seconds > 0}
                                                ></div>
                                            {/key}
                                        </div>
                                        <p
                                            aria-hidden="true"
                                            class="flex items-baseline justify-between px-3 pt-1.5 text-xs font-semibold text-ink-2"
                                        >
                                            <span>{seconds ? '조정 시간' : '조정 시간 종료'}</span>
                                            <strong class="text-base text-ink tabular-nums"
                                                >{seconds}초</strong
                                            >
                                        </p>
                                    </div>
                                {/if}
                                {#if !details && mainLane}
                                    <span
                                        class="pointer-events-none absolute top-1/2 right-4 -z-10 -translate-y-1/2 opacity-15 xl:scale-150"
                                        aria-hidden="true"
                                        ><PositionIcon position={mainLane} size="md" /></span
                                    >
                                {/if}
                                <div class="flex items-start justify-between gap-3">
                                    <span
                                        class="inline-flex items-center gap-1 rounded-small border border-role-dim bg-surface px-1.5 py-0.5 text-xs font-semibold text-role-gold"
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
                                            class="rounded-small border border-line bg-surface px-1.5 py-0.5 text-xs font-semibold text-ink-2"
                                            >{profile.riot.tier}</span
                                        >
                                    {/if}
                                </div>
                                <div
                                    class={[
                                        'flex items-center gap-3',
                                        details
                                            ? 'flex-row'
                                            : 'xl:flex-col xl:text-center xl:[&>:first-child]:size-12 xl:[&>:first-child]:text-lg'
                                    ]}
                                >
                                    <PlayerFace name={open.displayName} imageUrl={open.iconUrl} size="md" />
                                    <div class="min-w-0">
                                        <p
                                            class="text-xl leading-tight font-bold tracking-tight wrap-anywhere xl:text-2xl"
                                        >
                                            {open.displayName}
                                        </p>
                                        <p class="mt-0.5 text-xs font-medium text-muted tabular-nums">
                                            MMR <strong class="font-brand text-sm text-ink-2">
                                                {formatMmr(mainLane ? open.mmr[mainLane] : null)}
                                            </strong>
                                        </p>
                                    </div>
                                </div>
                                {#if profile && !details && profile.summary.games}
                                    <div
                                        class="grid grid-cols-3 gap-px overflow-hidden rounded-form border border-line bg-line"
                                    >
                                        {#each [['승률', winRate(profile.summary.games, profile.summary.wins)], ['승패', `${profile.summary.wins}-${profile.summary.losses}`], [profile.recentChronologyKnown === false ? '표시 기록' : '최근', `${recentWins}승 ${profile.recentGames.length - recentWins}패`]] as [label, value] (label)}
                                            <div class="bg-surface px-2 py-1.5 text-center">
                                                <p class="text-xs text-muted">{label}</p>
                                                <p class="text-sm font-bold tabular-nums">{value}</p>
                                            </div>
                                        {/each}
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
                                class="flex min-h-36 flex-1 flex-col items-center justify-center gap-1 rounded-form border border-dashed border-line-strong/60 bg-surface-2 px-4 py-4 text-center"
                            >
                                {#if fullyAssigned}
                                    <p class="font-semibold text-ink-2">모든 팀에 5명씩 배치됐어요</p>
                                    {#if controls}
                                        <Button variant="primary" disabled={busy} onclick={confirmFormation}>
                                            경매 편성 확정
                                        </Button>
                                    {/if}
                                {:else}
                                    <p class="font-semibold text-ink-2">후보 대기</p>
                                    <p class="text-sm text-muted">
                                        {auction.queue.length
                                            ? controls
                                                ? '다음 후보를 뽑아 입찰을 시작해요'
                                                : '다음 후보를 기다리고 있어요'
                                            : controls
                                              ? '대기 후보가 없어요. 후보 목록에서 유찰 후보를 배치하거나 다시 올려 주세요'
                                              : '대기 중인 후보가 없어요'}
                                    </p>
                                {/if}
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
                    <h3 id="candidates" class="text-base font-bold tracking-tight">후보 현황</h3>
                    <span class="text-xs font-semibold text-muted tabular-nums"
                        >{(open ? 1 : 0) + auction.queue.length + auction.unsold.length}명</span
                    >
                </div>
                <div class={['grid gap-1', controls && 'sm:grid-cols-2']}>
                    <Button variant="secondary" class="w-full" onclick={() => (listOpen = true)}
                        >후보 목록</Button
                    >
                    {#if controls}
                        <Button variant="danger" class="w-full" disabled={busy || !canReset} onclick={reset}
                            >초기화</Button
                        >
                    {/if}
                </div>
                <div
                    class="grid grid-cols-3 gap-px overflow-hidden rounded-form border border-line bg-line text-center"
                >
                    {#each [['현재', open ? 1 : 0, 'text-nexus'], ['대기', auction.queue.length, ''], ['유찰 후보', auction.unsold.length, 'text-warning']] as [label, value, tone] (label)}
                        <div class="bg-surface-2 px-2 py-1.5">
                            <p class="text-xs text-muted">{label}</p>
                            <p class={['font-brand text-lg leading-tight font-bold tabular-nums', tone]}>
                                {value}
                            </p>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}
    </div>

    {#if auction.history.length}
        <details class="panel group overflow-hidden">
            <summary
                class="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-ui font-semibold marker:content-none hover:bg-surface-hover focus-visible:-outline-offset-2 group-open:bg-surface-2 pointer-coarse:min-h-11"
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
                            <tr class={['border-t border-line', entry.voided && 'text-muted']}>
                                <td class="py-2 text-right text-muted tabular-nums">{entry.order}</td>
                                <td class={['px-3 py-2 font-semibold', entry.voided && 'line-through']}>
                                    <span class="flex items-center gap-2">
                                        <PlayerFace
                                            name={entry.displayName}
                                            imageUrl={entry.iconUrl}
                                            size="sm"
                                        />
                                        {entry.displayName}
                                    </span>
                                </td>
                                <td class="px-3 py-2"
                                    >{RESULT[entry.result]}{entry.voided ? ' (되돌림)' : ''}</td
                                >
                                <td class="px-3 py-2">{entry.teamName ?? '-'}</td>
                                <td class="py-2 text-right font-semibold tabular-nums"
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
    .clock-fill {
        background: linear-gradient(
            90deg,
            var(--color-nexus),
            var(--color-nexus-hover) 85%,
            var(--color-nexus)
        );
    }

    @media (prefers-reduced-motion: no-preference) {
        .clock-fill.running {
            animation: drain-clock var(--duration) linear forwards;
        }
    }

    @keyframes drain-clock {
        from {
            transform: scaleX(1);
        }
        to {
            transform: scaleX(0);
        }
    }

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
