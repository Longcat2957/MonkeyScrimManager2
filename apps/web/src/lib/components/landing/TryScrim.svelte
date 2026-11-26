<script lang="ts">
    import { onMount, tick } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { NavItem } from '#lib/components/layout/navigation.ts';
    import GameHero from '#lib/components/matches/GameHero.svelte';
    import GamePlayerDialog from '#lib/components/matches/GamePlayerDialog.svelte';
    import GameTeamTable from '#lib/components/matches/GameTeamTable.svelte';
    import RoflUploadDialog from '#lib/components/matches/RoflUploadDialog.svelte';
    import LaneMatrix from '#lib/components/scrims/LaneMatrix.svelte';
    import ParticipantBoard from '#lib/components/scrims/ParticipantBoard.svelte';
    import ScrimAdvanceButton from '#lib/components/scrims/ScrimAdvanceButton.svelte';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import AuctionDraftBoard from '#lib/components/teams/AuctionDraftBoard.svelte';
    import { DEMO_CAPACITY, SAMPLE_ROFL_NAME } from '#lib/content/landing.ts';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { DemoScrim } from '#lib/features/landing/demo.svelte.ts';
    import type { DemoGameTemplate } from '#lib/features/landing/game.ts';
    import type { GamePlayer } from '#lib/features/matches/types.ts';
    import { provideLocalActions } from '#lib/ui/actions.ts';
    import RecruitPost from './RecruitPost.svelte';

    // 채팅의 모집 글에서 시작해 실제 운영 화면(참가자·경매·경기 기록)으로 한 칸씩 밀려 가는 체험.
    // 업무 컴포넌트는 운영 화면과 같은 것을 쓰고, form action만 브라우저 안의 가상 내전이 받는다.
    let { template }: { template: Promise<DemoGameTemplate> } = $props();

    const demo = new DemoScrim();
    provideLocalActions(demo.submit);

    const STAGES = ['모집 글', '참가자 확인', '팀장 경매', '경기 기록'];
    const STEPS = ['모집·참가자', '팀 편성', '대진·경기', '결과'];

    let root = $state<HTMLElement>();
    let track = $state<HTMLElement>();
    let panels = $state<HTMLElement[]>([]);
    let offset = $state(0);
    let height = $state<number | null>(null);
    let uploadOpen = $state(false);
    let detail = $state<GamePlayer | null>(null);
    let detailOpen = $state(false);
    let templateError = $state(false);

    const step = $derived(demo.status === 'completed' ? 3 : Math.max(0, demo.stage - 1));
    const navigation = $derived<NavItem[]>(
        STEPS.map((label, index) => ({ label, href: '', static: index !== step, current: index === step }))
    );
    const sample = $derived([new File([new Uint8Array(1)], SAMPLE_ROFL_NAME)]);
    const result = $derived(demo.result);
    const maxDamage = $derived(
        Math.max(
            0,
            ...(result?.game.sides.flatMap((side) => side.players.map((player) => player.damage ?? 0)) ?? [])
        )
    );
    const lanes = $derived.by(() => {
        const counts = Object.fromEntries(
            (['top', 'jungle', 'mid', 'bot', 'support'] as LolPosition[]).map((key) => [
                key,
                { primary: 0, secondary: 0 }
            ])
        ) as Record<LolPosition, { primary: number; secondary: number }>;
        for (const participant of demo.participants)
            participant.positions.forEach((position, index) => {
                if (index === 0) counts[position].primary += 1;
                else counts[position].secondary += 1;
            });
        return counts;
    });
    const roster = $derived(demo.members.map(({ id, name, positions }) => ({ id, name, positions })));

    onMount(() => {
        template.then(
            (value) => (demo.template = value),
            () => (templateError = true)
        );
        // 화면 폭이 바뀌면 현재 칸의 위치와 높이를 다시 맞춘다.
        const observer = new ResizeObserver(measure);
        if (track) observer.observe(track);
        for (const panel of panels) observer.observe(panel);
        return () => observer.disconnect();
    });

    function measure() {
        const current = panels[demo.stage];
        if (!current) return;
        offset = current.offsetLeft;
        // 첫 칸에서는 옆에 보이는 상황판까지 높이에 넣는다.
        const visible = demo.stage === 0 ? panels.slice(0, 2) : [current];
        height = Math.max(...visible.map((panel) => panel.offsetHeight));
    }

    // 단계가 바뀌면 새 칸으로 밀고, 키보드·화면 낭독기 사용자를 위해 그 칸으로 포커스를 옮긴다.
    let shown = 0;
    $effect(() => {
        const stage = demo.stage;
        void tick().then(() => {
            measure();
            if (stage === shown) return;
            shown = stage;
            const panel = panels[stage];
            panel?.focus({ preventScroll: true });
            // 단계 표시까지 함께 보이도록 체험 영역의 위쪽으로 맞춘다.
            const top = root?.getBoundingClientRect().top ?? 0;
            if (top < 0 || top > innerHeight * 0.6)
                root?.scrollIntoView({
                    block: 'start',
                    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                });
        });
    });

    function restart() {
        uploadOpen = false;
        demo.reset();
    }
</script>

{#snippet advance()}
    <ScrimAdvanceButton nextAction={demo.nextAction} />
{/snippet}

<div bind:this={root} class="grid min-w-0 scroll-mt-20 gap-3">
    {#if demo.stage > 0}
        <ScrimSummary
            scrim={demo.scrim}
            {navigation}
            headingLevel={3}
            action={demo.stage === 1 ? advance : undefined}
        />
    {/if}

    <div bind:this={track} class="try-viewport" style:height={height === null ? undefined : `${height}px`}>
        <div class="try-track relative flex items-start gap-4" style:transform={`translateX(${-offset}px)`}>
            {#each STAGES as label, index (label)}
                <section
                    bind:this={panels[index]}
                    tabindex="-1"
                    aria-label={label}
                    inert={index !== demo.stage}
                    class={[
                        'try-panel min-w-0 shrink-0 outline-none',
                        index === 0 ? 'try-chat' : 'try-board',
                        index === 1 && demo.stage === 0 && 'try-beside',
                        index !== demo.stage && 'try-idle'
                    ]}
                >
                    {#if index === 0}
                        <RecruitPost
                            title={demo.scrim.title}
                            scheduledAt={demo.scrim.scheduledAt}
                            teamCount={demo.scrim.teamCount}
                            {roster}
                            capacity={DEMO_CAPACITY}
                            joined={demo.joined}
                            onjoin={() => demo.join()}
                        />
                    {:else if index === 1}
                        <div class="grid min-w-0 gap-2.5">
                            <p class="text-ui text-ink-2">
                                여기부터는 운영자 화면이에요. 신청자는 웹 가입 없이 명단에 바로 들어와요.
                            </p>
                            <LaneMatrix counts={lanes} required={demo.scrim.teamCount} />
                            <ParticipantBoard
                                guildId={demo.scrimId}
                                participants={demo.participants}
                                counts={demo.counts}
                                manager
                                canSelect={false}
                            />
                        </div>
                    {:else if index === 2}
                        <div class="grid min-w-0 gap-2.5">
                            <p class="text-ui text-ink-2">
                                두 팀장이 1000포인트로 다섯 명을 이미 데려왔어요. 남은 후보를 뽑아 팀에 낙찰해
                                보세요.
                            </p>
                            <AuctionDraftBoard auction={demo.auctionView} manager />
                        </div>
                    {:else}
                        {@render record()}
                    {/if}
                </section>
            {/each}
        </div>
    </div>
</div>

{#snippet record()}
    {@const [teamA, teamB] = demo.lineupTeams}
    <div class="@container/record grid min-w-0 gap-3">
        <header class="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                <h4 class="flex min-w-0 flex-wrap items-baseline gap-2 text-lg font-bold">
                    <span class="wrap-anywhere">{teamA.name}</span>
                    <span class="text-muted"
                        ><span aria-hidden="true">:</span><span class="sr-only">대</span></span
                    >
                    <span class="wrap-anywhere">{teamB.name}</span>
                </h4>
                <p class="flex items-center gap-2 text-xs font-semibold text-ink-2">
                    <span>BO1</span>
                    {#if result}<StatusTag text="종료" state="success" />{:else}<StatusTag
                            text="진행 중"
                            state="warning"
                        />{/if}
                </p>
            </div>
            {#if result}
                <Button onclick={restart}>처음부터</Button>
            {:else}
                <Button variant="primary" disabled={templateError} onclick={() => (uploadOpen = true)}
                    >ROFL 업로드</Button
                >
            {/if}
        </header>
        {#if result}
            <div class="panel overflow-hidden">
                <GameHero game={result.game} />
                <GameTeamTable
                    sides={result.game.sides}
                    lineup={result.lineup}
                    guildId={demo.scrimId}
                    durationSec={result.game.durationSec}
                    {maxDamage}
                    ondetail={(player) => {
                        detail = player;
                        detailOpen = true;
                    }}
                />
            </div>
            <p class="text-ui text-ink-2">
                실제 서버에서는 이 기록이 전적과 포지션별 MMR에 반영되고, 공유 링크로 로그인 없이 볼 수
                있어요.
            </p>
        {:else}
            <p class={['text-ui', templateError ? 'text-error' : 'text-ink-2']}>
                {templateError
                    ? '샘플 기록을 불러오지 못했어요. 새로고침해 다시 시도해 주세요.'
                    : '경기가 끝나면 리플레이 파일만 올리면 돼요. 준비된 샘플 리플레이로 블루 팀을 확인하고 등록해 보세요.'}
            </p>
        {/if}
    </div>
{/snippet}

<RoflUploadDialog
    bind:open={uploadOpen}
    initialFiles={sample}
    context={{
        max: 1,
        expectedRevision: 0,
        expectedGameNumber: 1,
        plannedBlueTeamSlot: null,
        scrimTitle: demo.scrim.title,
        teamA: demo.lineupTeams[0].name,
        teamB: demo.lineupTeams[1].name
    }}
    onrecorded={() => {}}
/>
{#if result}
    <GamePlayerDialog bind:open={detailOpen} player={detail} durationSec={result.game.durationSec} />
{/if}

<style>
    .try-chat,
    .try-board {
        width: 100%;
    }

    /* 이웃 칸은 16px 간격 밖에 있으므로, 칸 끝에 닿은 포커스 테두리만 보이도록 4px까지 그린다. */
    .try-viewport {
        overflow: clip;
        overflow-clip-margin: 0.25rem;
    }

    .try-idle {
        opacity: 0.45;
    }

    @media (min-width: 64rem) {
        .try-chat {
            width: 24rem;
        }

        /* 첫 칸에서는 모집 글 옆 남은 폭에 상황판 전체를 보이고, 참가하면 밀리면서 전체 폭으로 넓어진다. */
        .try-beside {
            width: calc(100% - 25rem);
        }
    }

    @media (prefers-reduced-motion: no-preference) {
        .try-viewport {
            transition: height 420ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .try-track {
            transition: transform 620ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .try-panel {
            transition:
                opacity 420ms ease-out,
                width 620ms cubic-bezier(0.16, 1, 0.3, 1);
        }
    }
</style>
