<script lang="ts">
    import { page } from '$app/state';
    import { tick } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { toast } from '#lib/ui/toast.ts';
    import { DragState } from '#lib/components/teams/drag.svelte.ts';
    import {
        bestOfLabel,
        bracketSeats,
        STAGE_LABEL,
        type BracketMatch,
        type BracketView
    } from '#lib/features/scrims/bracket.ts';
    import { formationReturnAction } from '#lib/features/scrims/formation.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { flashChange } from '#lib/ui/mark-change.svelte.ts';
    import BracketFormatControl from './BracketFormatControl.svelte';
    import FirstSetSideField from './FirstSetSideField.svelte';
    import BracketMatchBox from './BracketMatchBox.svelte';
    import BracketTeamContent from './BracketTeamContent.svelte';

    let {
        bracket,
        auction,
        guildId,
        emptyMessage = '팀 편성이 끝나면 대진을 만들 수 있어요'
    }: { bracket: BracketView | null; auction: boolean; guildId: string; emptyMessage?: string } = $props();

    let board = $state<HTMLElement>();
    let selectedId = $state<string | null>(null);
    let selectionHeight = $state(0);
    let busy = $state(false);
    let blueChoices = $state<Record<string, string>>({});

    const pairingKey = (match: BracketMatch) => `${match.key}:${match.a.teamId}:${match.b.teamId}`;
    const resolved = $derived(bracket?.matches.filter((match) => match.a.teamId && match.b.teamId) ?? []);
    const firstBlue = (match: BracketMatch) => (auction ? match.a.teamId : blueChoices[pairingKey(match)]);
    const sidesReady = $derived(resolved.length > 0 && resolved.every(firstBlue));
    const sideFields = $derived(
        Object.fromEntries(resolved.map((match) => [`blueTeamId:${match.key}`, firstBlue(match) ?? '']))
    );

    const editing = $derived(Boolean(bracket?.can.edit));
    const returnAction = $derived(formationReturnAction(auction ? 'auction' : 'manual'));
    const openingSides = (match: BracketMatch) =>
        Boolean(auction && match.a.seat && match.b.seat && !match.matchId && match.status === 'pending');
    const canSwap = (match: BracketMatch) =>
        Boolean(bracket?.can.unlock && openingSides(match) && match.a.teamId && match.b.teamId);
    const seats = $derived(bracket ? bracketSeats(bracket.matches) : []);
    const placed = $derived(seats.filter((seat) => seat.teamId).length);
    const pool = $derived(
        bracket?.teams.filter((team) => !seats.some((seat) => seat.teamId === team.id)) ?? []
    );
    const selectedName = $derived(bracket?.teams.find((team) => team.id === selectedId)?.name ?? '');
    const stages = $derived(
        (['semi', 'final'] as const)
            .map((stage) => ({
                stage,
                matches: bracket?.matches.filter((match) => match.stage === stage) ?? []
            }))
            .filter((column) => column.matches.length)
    );
    const labelOf = (key: string) => bracket?.matches.find((match) => match.key === key)?.label ?? '';
    const seatLabel = (key: string) => seats.find((seat) => seat.key === key)?.label ?? '';
    const seatOf = (teamId: string) => seats.find((seat) => seat.teamId === teamId)?.key ?? null;
    const teamButton = (id: string) =>
        board?.querySelector<HTMLElement>(`[data-bracket-team="${CSS.escape(id)}"]`);

    function accepts(teamId: string, target: string) {
        if (editing) return target === 'pool' ? seatOf(teamId) !== null : seatLabel(target) !== '';
        return Boolean(
            bracket?.matches.some(
                (match) =>
                    canSwap(match) &&
                    ((match.a.teamId === teamId && match.b.seat === target) ||
                        (match.b.teamId === teamId && match.a.seat === target))
            )
        );
    }

    const drag = new DragState({
        enabled: () => !busy && (editing || Boolean(auction && bracket?.can.unlock)),
        accepts,
        ondrop: (teamId, target) => (target === 'pool' ? place(seatOf(teamId)!, null) : place(target, teamId))
    });

    async function run(name: string, fields: Record<string, string> = {}) {
        if (busy) return false;
        busy = true;
        try {
            const message = await postAction(name, fields);
            if (message) toast.error(message);
            return !message;
        } finally {
            busy = false;
        }
    }

    function select(teamId: string) {
        if (busy) return;
        selectedId = selectedId === teamId ? null : teamId;
    }

    async function place(seat: string, teamId: string | null) {
        if (busy || (teamId ? !accepts(teamId, seat) : !editing)) return;
        const trigger = document.activeElement;
        const keyboard = trigger instanceof HTMLElement && trigger.matches(':focus-visible');
        const previousTeam = seats.find((item) => item.key === seat)?.teamId ?? null;
        const movedTeam = teamId ?? previousTeam;
        const saved = await run('place', { seat, teamId: teamId ?? '' });
        if (saved) selectedId = null;
        await tick();
        if (saved && previousTeam !== teamId) {
            // 확정된 배치에서 교체된 팀은 반대편 자리나 팀 풀로 돌아간다.
            for (const id of [teamId, previousTeam]) {
                const destination = id && teamButton(id);
                if (destination) flashChange(destination);
            }
        }
        if (keyboard && (document.activeElement === document.body || document.activeElement === trigger)) {
            if (!saved && trigger.isConnected) trigger.focus();
            else if (movedTeam) teamButton(movedTeam)?.focus();
        }
    }

    async function reset() {
        if (await confirm('배치한 팀을 모두 팀 풀로 돌릴까요? 경기 방식은 그대로 둬요.', '배치 초기화'))
            await run('reset');
    }

    async function reopenFormation() {
        const fields = {
            formationMethod: auction ? 'auction' : 'manual',
            expectedRevision: String(page.data.scrim?.revision ?? '')
        };
        if (await confirm(returnAction.message, returnAction.label)) await run('reopenFormation', fields);
    }

    async function confirmBracket() {
        if (await confirm('현재 대진과 경기 방식으로 내전을 시작할까요?', '대진 확정·내전 시작'))
            await run('confirm', { start: '1', ...sideFields });
    }

    async function start() {
        if (await confirm('확정된 대진으로 내전을 시작할까요?', '내전 시작')) await run('start', sideFields);
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && selectedId) selectedId = null;
    }
</script>

<svelte:window {onkeydown} />

{#if !bracket}
    <section aria-labelledby="bracket-board" class="flex flex-col gap-3">
        <h2 id="bracket-board" class="sr-only">대진</h2>
        <SectionState state="empty" message={emptyMessage} />
    </section>
{:else}
    <!-- 팀 선택과 라운드별 배치를 먼저 하고, 경기 방식과 시작 여부는 아래에서 결정한다. -->
    <section
        bind:this={board}
        aria-labelledby="bracket-board"
        aria-busy={busy}
        class="bracket-board @container min-w-0"
        style:--selection-height={`${selectedId ? selectionHeight : 0}px`}
    >
        <h2 id="bracket-board" class="sr-only">대진</h2>

        {#if (editing || (auction && bracket.can.unlock)) && selectedId}
            <p
                bind:clientHeight={selectionHeight}
                class="sticky top-(--app-header-height) z-20 mb-3 flex min-h-11 items-center gap-3 rounded-form border border-nexus bg-selected px-3 text-ui break-words lg:top-0"
                aria-live="polite"
            >
                <span class="min-w-0 flex-1">
                    <strong>{selectedName}</strong> 선택됨
                    <span class="text-xs text-muted">놓을 자리를 선택하세요</span>
                </span>
                <Button
                    variant="quiet"
                    size="sm"
                    class="min-h-11 shrink-0 px-2"
                    onclick={() => (selectedId = null)}>선택 취소</Button
                >
            </p>
        {/if}

        <div class="relative grid min-w-0 gap-5">
            {#if editing && (pool.length || drag.id)}
                <!-- 팀 풀: 끌어서 자리에 놓거나 누른 뒤 자리를 누른다. 배치된 팀을 여기로 끌면 배치 해제다. -->
                <section
                    aria-label="배치할 팀"
                    class={[
                        'min-w-0 rounded-form',
                        !pool.length &&
                            'flex min-h-11 items-center justify-center border border-dashed border-nexus bg-selected',
                        !pool.length && auction && 'absolute inset-x-0 top-full z-10 mt-2',
                        drag.over === 'pool' && 'ring-2 ring-nexus/40 ring-inset'
                    ]}
                    ondragover={(event) => drag.enter(event, 'pool')}
                    ondragleave={() => drag.leave('pool')}
                    ondrop={(event) => drag.drop(event, 'pool')}
                >
                    {#if pool.length}
                        <div class="mb-2 flex items-baseline gap-2">
                            <h3 class="text-sm font-bold">배치할 팀</h3>
                            <span class="text-xs text-muted tabular-nums">{pool.length}팀</span>
                        </div>
                        <ul class="grid grid-cols-2 gap-2 @min-[52rem]:grid-cols-4">
                            {#each pool as team (team.id)}
                                <li>
                                    <button
                                        type="button"
                                        draggable="true"
                                        disabled={busy}
                                        aria-pressed={selectedId === team.id}
                                        data-bracket-team={team.id}
                                        class={[
                                            'flex min-h-12 w-full cursor-grab items-center rounded-form border border-line bg-surface-2 px-2 py-2 sm:px-3 active:cursor-grabbing',
                                            drag.id === team.id && 'opacity-50',
                                            selectedId === team.id
                                                ? 'bg-selected text-nexus ring-1 ring-inset ring-nexus'
                                                : 'hover:bg-surface-hover'
                                        ]}
                                        ondragstart={(event) => drag.start(event, team.id)}
                                        ondragend={() => drag.end()}
                                        onclick={() => select(team.id)}
                                    >
                                        <BracketTeamContent {team} />
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="text-ui font-medium text-ink-2">여기에 놓아 배치 해제</p>
                    {/if}
                </section>
            {/if}

            <div class="grid min-w-0 gap-5">
                {#each stages as { stage, matches } (stage)}
                    <section aria-label={STAGE_LABEL[stage]}>
                        <div class={['grid min-w-0 gap-3', matches.length > 1 && '@min-[42rem]:grid-cols-2']}>
                            {#each matches as match (match.key)}
                                <div class="grid min-w-0 content-start gap-2">
                                    <BracketMatchBox
                                        {match}
                                        formatLabel={!editing && bracket.bestOf[stage]
                                            ? bestOfLabel(bracket.bestOf[stage]!)
                                            : ''}
                                        teams={bracket.teams}
                                        {guildId}
                                        {labelOf}
                                        {seatLabel}
                                        {editing}
                                        openingSides={openingSides(match)}
                                        swapOnly={canSwap(match)}
                                        disabled={busy}
                                        {selectedId}
                                        {drag}
                                        onselect={select}
                                        onplace={place}
                                    />
                                    {#if editing || bracket.can.unlock}
                                        {@const teamA = bracket.teams.find(
                                            (team) => team.id === match.a.teamId
                                        )}
                                        {@const teamB = bracket.teams.find(
                                            (team) => team.id === match.b.teamId
                                        )}
                                        {#if !auction && teamA && teamB}
                                            <FirstSetSideField
                                                label={`${match.label} 1세트 진영`}
                                                {teamA}
                                                {teamB}
                                                disabled={busy}
                                                bind:value={
                                                    () => blueChoices[pairingKey(match)] ?? '',
                                                    (value) => (blueChoices[pairingKey(match)] = value)
                                                }
                                            />
                                        {:else if match.a.from || match.b.from}
                                            <p class="text-xs text-muted">
                                                결승 진영은 대진 결정 후 경기 상세에서 선택해요.
                                            </p>
                                        {/if}
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </section>
                {/each}
            </div>
        </div>
        {#if editing || bracket.can.unlock}
            <section
                class="mt-5 grid gap-3 border-t border-line pt-3 @min-[48rem]:grid-cols-[minmax(0,1fr)_auto] @min-[48rem]:items-end"
            >
                {#if editing}
                    <div class="min-w-0">
                        <h3 class="mb-1 text-sm font-bold">경기 방식</h3>
                        <div class="flex flex-wrap gap-x-6 gap-y-1">
                            {#each stages as { stage } (stage)}
                                <div class="flex flex-wrap items-center gap-x-2">
                                    <span class="text-ui font-medium text-ink-2">{STAGE_LABEL[stage]}</span>
                                    <BracketFormatControl
                                        label={STAGE_LABEL[stage]}
                                        bestOf={bracket.bestOf[stage]!}
                                        disabled={busy}
                                        onchange={async (value) =>
                                            void (await run('bestOf', { stage, bestOf: String(value) }))}
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
                <div class="flex flex-wrap items-center gap-2">
                    {#if busy}<Spinner label="대진 처리 중" />{/if}
                    <Button variant="secondary" disabled={busy} onclick={reopenFormation}>
                        {returnAction.label}
                    </Button>
                    {#if editing}
                        <Button variant="quiet" disabled={busy || placed === 0} onclick={reset}>초기화</Button
                        >
                        <Button
                            variant="primary"
                            disabled={busy || pool.length > 0 || !sidesReady}
                            onclick={confirmBracket}>대진 확정·내전 시작</Button
                        >
                    {:else}
                        <StatusTag text="확정" state="success" />
                        <Button variant="secondary" disabled={busy} onclick={() => run('unlock')}
                            >대진 확정 해제</Button
                        >
                        <Button variant="primary" disabled={busy || !sidesReady} onclick={start}
                            >내전 시작</Button
                        >
                    {/if}
                </div>
            </section>
        {/if}
    </section>
{/if}

<style>
    .bracket-board :global(button) {
        scroll-margin-block-start: var(--selection-height);
    }
</style>
