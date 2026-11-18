<script lang="ts">
    import { tick } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { toast } from '#lib/ui/toast.ts';
    import BracketFormatControl from '#lib/components/bracket/BracketFormatControl.svelte';
    import FirstSetSideField from '#lib/components/bracket/FirstSetSideField.svelte';
    import { bestOfLabel, type BestOf } from '#lib/features/scrims/bracket.ts';
    import {
        moveAssignment,
        type Assignments,
        type FormationPlayer,
        type FormationTeam,
        type PairRecord,
        type SlotKey
    } from '#lib/features/scrims/formation.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';
    import ChangeMethodButton from './ChangeMethodButton.svelte';
    import { DragState } from './drag.svelte.ts';
    import FormationHeadToHead from './FormationHeadToHead.svelte';
    import FormationPool from './FormationPool.svelte';
    import FormationSynergyRail from './FormationSynergyRail.svelte';
    import FormationTeamCard from './FormationTeamCard.svelte';

    type Props = {
        teams: FormationTeam[];
        players: FormationPlayer[];
        assignments: Assignments;
        confirmed: boolean;
        editable: boolean;
        pairs: Record<string, PairRecord>;
    };

    let { teams, players, assignments, confirmed, editable, pairs }: Props = $props();

    let selectedId = $state<string | null>(null);
    // 서버 응답 전에 화면을 먼저 바꾸는 낙관적 배정이다. 응답이 모두 끝나면 서버 값으로 돌아간다.
    let optimistic = $state<Assignments | null>(null);
    let pending = $state(0);
    let busy = $state(false);
    let details = $state(false);
    let bestOf = $state<BestOf>(3);
    let blueTeamId = $state('');
    let selectionHeight = $state(0);
    let queue: { participantId: string; slot: SlotKey | null }[] = [];
    let processing = false;

    // 끌어 놓기: 자리에 놓으면 배치·교환, 미배정 목록에 놓으면 배정 해제다.
    const drag = new DragState({
        enabled: () => editable && !busy,
        accepts: (id, target) => target !== 'pool' || Boolean(current[id]),
        ondrop: (id, target) => move(id, target === 'pool' ? null : (target as SlotKey))
    });

    const current = $derived(optimistic ?? assignments);
    const unassigned = $derived(players.filter((player) => !current[player.participantId]));
    const placed = $derived(players.length - unassigned.length);
    const selectedName = $derived(
        players.find((player) => player.participantId === selectedId)?.displayName ?? ''
    );
    const startsMatch = $derived(teams.length === 2);
    const confirmBlocked = $derived(
        unassigned.length
            ? '모든 참가자를 배치해야 확정할 수 있어요'
            : startsMatch && !teams.some((team) => team.id === blueTeamId)
              ? '경기를 시작하려면 1세트 블루 팀을 골라 주세요'
              : null
    );

    function select(participantId: string) {
        if (!editable || busy) return;
        selectedId = selectedId === participantId ? null : participantId;
    }

    async function move(participantId: string, slot: SlotKey | null) {
        if (!editable || busy) return;
        selectedId = null;
        optimistic = moveAssignment(current, participantId, slot);
        queue.push({ participantId, slot });
        pending++;
        if (processing) return;
        processing = true;
        try {
            while (queue.length) {
                const next = queue[0]!;
                const message = await postAction('move', {
                    participantId: next.participantId,
                    slot: next.slot ?? ''
                });
                await tick();
                queue.shift();
                pending--;
                if (message) {
                    toast.error(message);
                    break;
                }
                optimistic = queue.length
                    ? queue.reduce(
                          (value, item) => moveAssignment(value, item.participantId, item.slot),
                          assignments
                      )
                    : null;
            }
        } finally {
            queue = [];
            pending = 0;
            optimistic = null;
            processing = false;
        }
    }

    async function run(name: 'reset' | 'confirm') {
        if (busy || pending) return;
        busy = true;
        try {
            const message = await postAction(
                name,
                name === 'confirm' && startsMatch ? { bestOf: String(bestOf), blueTeamId } : {}
            );
            if (message) toast.error(message);
        } finally {
            busy = false;
        }
    }

    async function reset() {
        if (await confirm('배정된 모든 참가자를 미배정으로 되돌릴까요?', '배정 초기화')) await run('reset');
    }

    async function confirmFormation() {
        if (
            await confirm(
                startsMatch
                    ? `${bestOfLabel(bestOf)} 경기를 시작해요. 지금 배치한 선수와 포지션을 경기 전체에 적용할까요?`
                    : '확정하면 대진 배치로 이동해요. 확정할까요?',
                startsMatch ? '편성 확정·경기 시작' : '편성 확정'
            )
        )
            await run('confirm');
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && selectedId) selectedId = null;
    }
</script>

<svelte:window {onkeydown} />

<!--
    엔트리 편성 작업판: 도구 줄 → 미배정 목록 → 팀 열(1px 경계로 붙음).
	참가자를 끌어 자리에 놓거나 누른 뒤 자리를 누르면 배치되고, 자리에 사람이 있으면 서로 바뀐다.
-->
<section
    aria-labelledby="manual-formation"
    aria-busy={pending > 0 || busy}
    class="panel manual-board w-full min-w-0 overflow-clip"
    style:--selection-height={`${selectedId ? selectionHeight : 0}px`}
>
    <!-- 도구 줄 -->
    <header class="panel-bar">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <div class="flex items-center gap-2">
                <h2 id="manual-formation" class="text-lg leading-6 font-bold tracking-tight">수동 편성</h2>
                {#if confirmed}
                    <StatusTag text="확정" state="success" />
                {:else if !editable}
                    <StatusTag text="편성 중" state="info" />
                {/if}
                {#if pending > 0 || busy}
                    <Spinner />
                {/if}
            </div>
            <p class="text-xs font-medium text-muted tabular-nums">
                <strong class="text-ink">{placed}</strong>/{players.length} 배치
            </p>
        </div>
        <!-- 시너지·라인 상대 전적 레일을 펼친다. -->
        <Button
            variant={details ? 'secondary' : 'quiet'}
            class="px-3 text-ui"
            aria-expanded={details}
            onclick={() => (details = !details)}
        >
            {details ? '상세 닫기' : '상세'}
        </Button>
    </header>

    {#if editable && selectedId}
        <!-- 선택한 참가자와 배치 안내는 스크롤 중에도 유지한다. -->
        <p
            bind:clientHeight={selectionHeight}
            class="sticky top-(--app-header-height) z-20 flex min-h-9 items-center gap-2 border-b border-nexus bg-selected px-4 py-1.5 text-ui"
            aria-live="polite"
        >
            <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-baseline gap-1">
                    <strong class="truncate">{selectedName}</strong>
                    <span class="shrink-0 text-xs font-semibold text-nexus">선택됨</span>
                </span>
                <span class="text-xs text-ink-2">놓을 자리를 누르거나 끌어 놓으세요</span>
            </span>
            <Button variant="quiet" class="shrink-0 px-2 text-ui" onclick={() => (selectedId = null)}
                >선택 취소</Button
            >
        </p>
    {/if}

    {#snippet teamColumn(team: FormationTeam)}
        <FormationTeamCard
            {team}
            {players}
            assignments={current}
            {selectedId}
            interactive={editable && !busy}
            {drag}
            {details}
            onselect={select}
            onplace={(slot) => selectedId && move(selectedId, slot)}
            onremove={(id) => move(id, null)}
        />
    {/snippet}

    {#if !confirmed && (unassigned.length > 0 || (editable && drag.id))}
        <FormationPool
            players={unassigned}
            {selectedId}
            interactive={editable && !busy}
            {drag}
            onselect={select}
        />
    {/if}

    <!-- 좁은 화면은 참가자를 먼저 고른 뒤 세로로 이어지는 팀 자리에 배치한다. -->
    <div class="relative bg-line">
        {#if details && desktop.current && teams.length === 2}
            <div class="grid grid-cols-[7rem_minmax(0,1fr)_5rem_minmax(0,1fr)_7rem] gap-px pt-px">
                <FormationSynergyRail team={teams[0]!} {players} assignments={current} {pairs} />
                {@render teamColumn(teams[0]!)}
                <FormationHeadToHead teams={[teams[0]!, teams[1]!]} {players} assignments={current} {pairs} />
                {@render teamColumn(teams[1]!)}
                <FormationSynergyRail team={teams[1]!} {players} assignments={current} {pairs} />
            </div>
        {:else if details && desktop.current}
            <div class="grid grid-cols-[7rem_minmax(0,1fr)_7rem_minmax(0,1fr)] gap-px pt-px">
                {#each teams as team (team.id)}
                    <FormationSynergyRail {team} {players} assignments={current} {pairs} />
                    {@render teamColumn(team)}
                {/each}
            </div>
        {:else}
            <div class="grid gap-px pt-px sm:grid-cols-2">
                {#each teams as team (team.id)}
                    <div class="min-w-0 bg-surface">
                        {@render teamColumn(team)}
                        {#if details}
                            <FormationSynergyRail {team} {players} assignments={current} {pairs} compact />
                        {/if}
                    </div>
                {/each}
            </div>
            {#if details && teams.length === 2}
                <div class="pt-px">
                    <FormationHeadToHead
                        teams={[teams[0]!, teams[1]!]}
                        {players}
                        assignments={current}
                        {pairs}
                        compact
                    />
                </div>
            {/if}
        {/if}
    </div>
    {#if editable}
        <footer class="border-t border-line">
            <div class="flex flex-wrap items-center justify-end gap-1 px-3 py-1">
                <ChangeMethodButton disabled={busy || pending > 0} />
                <Button variant="quiet" disabled={placed === 0 || busy || pending > 0} onclick={reset}
                    >배정 초기화</Button
                >
            </div>
            <div class="flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-line bg-surface-2 px-4 py-4">
                {#if startsMatch}
                    <div>
                        <p aria-hidden="true" class="text-xs font-semibold text-ink-2">경기 방식</p>
                        <BracketFormatControl
                            label="시리즈"
                            {bestOf}
                            disabled={busy || pending > 0}
                            onchange={async (value) => {
                                bestOf = value;
                            }}
                        />
                    </div>
                    <FirstSetSideField
                        teamA={teams[0]!}
                        teamB={teams[1]!}
                        bind:value={blueTeamId}
                        disabled={busy || pending > 0}
                    />
                {/if}
                <div
                    role="group"
                    aria-label="편성 확정"
                    aria-describedby={confirmBlocked ? 'formation-blocked' : undefined}
                    class="flex w-full flex-col gap-1.5 sm:ml-auto sm:w-auto sm:items-end"
                >
                    {#if confirmBlocked}
                        <p id="formation-blocked" class="text-xs text-ink-2">{confirmBlocked}</p>
                    {/if}
                    <Button
                        variant="primary"
                        disabled={Boolean(confirmBlocked) || busy || pending > 0}
                        onclick={confirmFormation}>{startsMatch ? '편성 확정·경기 시작' : '편성 확정'}</Button
                    >
                </div>
            </div>
        </footer>
    {/if}
</section>

<style>
    .manual-board :global(.formation-lanes) {
        display: grid;
        grid-template-rows: repeat(5, minmax(3.75rem, auto));
        gap: 0.375rem;
        padding: 0.5rem;
    }

    .manual-board :global(button) {
        scroll-margin-block-start: var(--selection-height);
    }
</style>
