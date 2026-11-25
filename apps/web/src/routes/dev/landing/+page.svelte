<script lang="ts">
    import { tick } from 'svelte';
    import LandingRecruitment from '#lib/components/scrims/LandingRecruitment.svelte';
    import FormationPool from '#lib/components/teams/FormationPool.svelte';
    import FormationTeamCard from '#lib/components/teams/FormationTeamCard.svelte';
    import { DragState } from '#lib/components/teams/drag.svelte.ts';
    import GamePlayerDialog from '#lib/components/matches/GamePlayerDialog.svelte';
    import GameTeamTable from '#lib/components/matches/GameTeamTable.svelte';
    import type { GamePlayer } from '#lib/features/matches/types.ts';
    import { moveAssignment, type SlotKey } from '#lib/features/scrims/formation.ts';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import {
        initialAssignments,
        landingPlayers,
        landingTeams,
        sampleLineup,
        sampleSides,
        visitor
    } from '#lib/mocks/landing.ts';

    let joined = $state(false);
    let positions = $state([...visitor.positions]);
    let assignments = $state({ ...initialAssignments });
    let selectedId = $state<string | null>(null);
    let board: HTMLElement;
    let detail = $state<GamePlayer | null>(null);
    let detailOpen = $state(false);
    const players = $derived(
        landingPlayers.flatMap((player) =>
            player !== visitor ? [player] : joined ? [{ ...visitor, positions }] : []
        )
    );
    const pool = $derived(players.filter((player) => !assignments[player.participantId]));
    const drag = new DragState({
        enabled: () => true,
        accepts: (id, target) =>
            players.some((player) => player.participantId === id) && (target !== 'pool' || !!assignments[id]),
        ondrop: (id, target) => move(id, target === 'pool' ? null : (target as SlotKey))
    });

    function setJoined(value: boolean) {
        joined = value;
        if (!value) {
            assignments = moveAssignment(assignments, visitor.participantId, null);
            if (selectedId === visitor.participantId) selectedId = null;
        }
    }
    function select(id: string) {
        selectedId = selectedId === id ? null : id;
    }
    async function move(id: string, target: SlotKey | null) {
        assignments = moveAssignment(assignments, id, target);
        selectedId = null;
        await tick();
        const item = board.querySelector<HTMLElement>(`[data-formation-player="${CSS.escape(id)}"]`);
        (item?.matches('button') ? item : item?.querySelector('button'))?.focus();
    }
</script>

<svelte:head>
    <title>내전 운영과 사용법 | {SERVICE_NAME}</title>
    <meta name="robots" content="noindex, nofollow" />
    <meta
        name="description"
        content="Discord에서 참가자를 모으고, 팀을 편성하고, 리플레이로 경기 전적과 MMR을 기록하는 방법."
    />
</svelte:head>

<svelte:window
    onkeydown={(event) => {
        if (event.key === 'Escape') selectedId = null;
    }}
/>

<div class="mx-auto max-w-6xl break-keep">
    <header class="py-8 sm:py-12">
        <h1 class="text-4xl font-bold leading-[1.15] tracking-tight sm:text-6xl">
            모집은 디스코드에서.<br />전적은 <span class="font-brand text-nexus">{SERVICE_NAME}</span>에.
        </h1>
        <p class="mt-5 max-w-prose leading-relaxed text-ink-2">
            함께할 사람을 모으고 팀을 나누세요. 경기가 끝나면 리플레이 파일 하나로 승패와 포지션별 MMR이
            남습니다.
        </p>
    </header>

    <section id="try-scrim" aria-labelledby="try-title" tabindex="-1" class="scroll-mt-20">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="try-title" class="text-2xl font-bold tracking-tight">한 판 체험하기</h2>
            <p class="text-sm text-muted">연습 명단입니다. 새로고침하면 처음으로 돌아갑니다.</p>
        </div>
        <div class="grid items-start gap-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
            <LandingRecruitment
                bind:joined={() => joined, setJoined}
                bind:positions
                player={visitor.displayName}
                participantCount={players.length}
                capacity={landingPlayers.length}
            />
            <section bind:this={board} aria-labelledby="formation-title" class="panel overflow-hidden">
                <h3 id="formation-title" class="panel-bar">팀 편성</h3>
                <FormationPool players={pool} {selectedId} interactive {drag} onselect={select} />
                <div class="grid gap-px border-t border-line bg-line sm:grid-cols-2">
                    {#each landingTeams as team (team.id)}
                        <FormationTeamCard
                            {team}
                            {players}
                            {assignments}
                            {selectedId}
                            interactive
                            details
                            {drag}
                            onselect={select}
                            onplace={(slot) => selectedId && move(selectedId, slot)}
                            onremove={(id) => move(id, null)}
                        />
                    {/each}
                </div>
            </section>
        </div>
        <details class="panel mt-4 overflow-hidden">
            <summary class="cursor-pointer px-4 py-3 font-semibold hover:bg-surface-hover"
                >이전 경기 기록 살펴보기</summary
            >
            <GameTeamTable
                sides={sampleSides}
                lineup={sampleLineup}
                guildId="sample"
                durationSec={1840}
                maxDamage={Math.max(
                    ...sampleSides.flatMap((side) => side.players.map((player) => player.damage ?? 0))
                )}
                ondetail={(player) => {
                    detail = player;
                    detailOpen = true;
                }}
            />
        </details>
        <GamePlayerDialog bind:open={detailOpen} player={detail} durationSec={1840} />
    </section>

    <section
        id="first-scrim"
        tabindex="-1"
        aria-labelledby="guide-title"
        class="mt-14 scroll-mt-24 border-t border-line-strong pt-6 pb-12 sm:mt-20"
    >
        <h2 id="guide-title" class="mb-6 text-3xl font-bold tracking-tight">첫 내전을 여는 순서</h2>
        <ol
            class="list-decimal divide-y divide-line ps-8 marker:font-brand marker:font-bold marker:text-nexus"
        >
            <li class="py-4 ps-2">
                <h3 class="font-semibold">서버 설정</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    봇이 있는 서버에서 관리자가 <strong>/초기설정</strong>을 실행합니다. 웹의 서버 관리에서
                    모집 글, 엔트리, 결과를 게시할 채널을 지정하세요.
                </p>
            </li>
            <li class="py-4 ps-2">
                <h3 class="font-semibold">참가자 모집</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    <strong>/내전모집</strong>에서 일정과 인원을 정하세요. 참가자는 모집 글에서 웹 가입 없이
                    신청하거나, 늦게 온다면 도착 시각을 지정해 대기할 수 있습니다.
                </p>
            </li>
            <li class="py-4 ps-2">
                <h3 class="font-semibold">팀 편성과 대진</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    선발 인원이 차면 모집을 마감합니다. 웹에서 직접 팀을 나누거나 경매로 편성한 뒤 대진과 출전
                    라인업을 확인하세요. 밴픽은 게임 안에서 진행합니다.
                </p>
            </li>
            <li class="py-4 ps-2">
                <h3 class="font-semibold">결과 기록</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    경기 화면에서 실제 블루 팀을 확인하고 해당 세트의 <strong>.rofl</strong> 파일을 올리세요. 출전자와
                    결과가 검증되면 전적과 MMR에 반영됩니다.
                </p>
            </li>
        </ol>
    </section>
</div>
