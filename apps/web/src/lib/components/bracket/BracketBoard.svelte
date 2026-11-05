<script lang="ts">
    import { Button, Loading, toast } from 'stdf';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { DragState } from '#lib/components/teams/drag.svelte.ts';
    import {
        bestOfLabel,
        bracketSeats,
        STAGE_LABEL,
        type BracketStage,
        type BracketView
    } from '#lib/features/scrims/bracket.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import BracketFormatControl from './BracketFormatControl.svelte';
    import BracketMatchBox from './BracketMatchBox.svelte';
    import BracketTeamContent from './BracketTeamContent.svelte';

    let { bracket, guildId }: { bracket: BracketView | null; guildId: string } = $props();

    let selectedId = $state<string | null>(null);
    let busy = $state(false);

    const editing = $derived(Boolean(bracket?.can.edit));
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

    // 팀을 자리에 끌어 놓으면 배치(자리에 있던 팀은 풀로), 팀 풀에 놓으면 배치 해제다.
    const drag = new DragState({
        enabled: () => editing && !busy,
        accepts: (teamId, target) => (target === 'pool' ? seatOf(teamId) !== null : seatLabel(target) !== ''),
        ondrop: (teamId, target) => (target === 'pool' ? place(seatOf(teamId)!, null) : place(target, teamId))
    });

    async function run(name: string, fields: Record<string, string> = {}) {
        busy = true;
        const message = await postAction(name, fields);
        busy = false;
        if (message) toast.error(message);
        return !message;
    }

    function select(teamId: string) {
        selectedId = selectedId === teamId ? null : teamId;
    }

    async function place(seat: string, teamId: string | null) {
        selectedId = null;
        await run('place', { seat, teamId: teamId ?? '' });
    }

    async function reset() {
        if (await confirm('배치한 팀을 모두 팀 풀로 돌릴까요? 경기 방식은 그대로 둬요.', '배치 초기화'))
            await run('reset');
    }

    async function confirmBracket() {
        if (
            await confirm(
                '확정하면 배치를 잠가요. 경기가 시작되기 전까지는 다시 편성할 수 있어요.',
                '대진 확정'
            )
        )
            await run('confirm');
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && selectedId) selectedId = null;
    }
</script>

<svelte:window {onkeydown} />

{#if !bracket}
    <section aria-labelledby="bracket-board" class="flex flex-col gap-4">
        <h2 id="bracket-board" class="text-xl font-semibold">대진</h2>
        <SectionState state="empty" message="팀 편성이 끝나면 대진을 만들 수 있어요" />
    </section>
{:else}
    <!-- 대진 작업판: 도구 줄 → [팀 풀 | 라운드 열]. 영역은 1px 경계로 붙는다. -->
    <section
        aria-labelledby="bracket-board"
        aria-busy={busy}
        class="w-full min-w-0 overflow-hidden rounded-(--radius-box) border border-border bg-border"
    >
        <div
            class="flex flex-col gap-2 bg-bg-surface px-4 py-3 md:flex-row md:items-center md:justify-between dark:bg-bg-surface-dark"
        >
            <div class="flex min-w-0 flex-col">
                <div class="flex items-center gap-2">
                    <h2 id="bracket-board" class="text-xs font-semibold opacity-60">대진</h2>
                    {#if bracket.confirmed}<StatusTag text="확정" state="success" />{/if}
                    {#if busy}<Loading type="1_0" height="6" width="6" />{/if}
                </div>
                <p class="text-sm font-semibold tabular-nums">
                    {bracket.teams.length}팀{#if editing}
                        · {placed}/{seats.length} 배치{/if}
                </p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
                {#if editing}
                    <Button
                        fill="text"
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        injClass="px-3 text-sm"
                        disabled={busy || placed === 0}
                        onclick={reset}>초기화</Button
                    >
                    <Button
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        injClass="px-4 text-sm"
                        disabled={busy || pool.length > 0}
                        onclick={confirmBracket}>대진 확정</Button
                    >
                {:else if bracket.can.unlock}
                    <Button
                        fill="lineLight"
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        injClass="px-4 text-sm"
                        disabled={busy}
                        onclick={() => run('unlock')}>다시 편성</Button
                    >
                {/if}
            </div>
        </div>

        {#if editing && selectedId}
            <p
                class="flex min-h-10 flex-wrap items-center gap-2 bg-bg-surface px-4 text-sm dark:bg-bg-surface-dark"
                aria-live="polite"
            >
                <span><strong>{selectedName}</strong> 선택됨 · 놓을 자리를 누르거나 끌어 놓으세요</span>
                <Button
                    fill="text"
                    size="auto"
                    heightOut="0"
                    heightIn="2"
                    injClass="px-2 text-sm"
                    onclick={() => (selectedId = null)}>선택 취소</Button
                >
            </p>
        {/if}

        <div class={['grid gap-px pt-px', editing && 'lg:grid-cols-[18rem_minmax(0,1fr)]']}>
            {#if editing}
                <!-- 팀 풀: 끌어서 자리에 놓거나 누른 뒤 자리를 누른다. 배치된 팀을 여기로 끌면 배치 해제다. -->
                <section
                    aria-labelledby="bracket-pool"
                    class={[
                        'flex flex-col bg-bg-surface transition dark:bg-bg-surface-dark',
                        drag.over === 'pool' && 'ring-2 ring-primary/40 ring-inset dark:ring-dark/40'
                    ]}
                    ondragover={(event) => drag.enter(event, 'pool')}
                    ondragleave={() => drag.leave('pool')}
                    ondrop={(event) => drag.drop(event, 'pool')}
                >
                    <h3 id="bracket-pool" class="px-3 py-2.5 text-sm font-semibold">팀 풀</h3>
                    {#if pool.length}
                        <ul class="flex flex-col gap-1.5 px-2 pb-2">
                            {#each pool as team (team.id)}
                                <li>
                                    <button
                                        type="button"
                                        draggable="true"
                                        aria-pressed={selectedId === team.id}
                                        class={[
                                            'flex min-h-14 w-full cursor-grab items-center rounded-(--radius-small) border px-3 py-2 active:cursor-grabbing',
                                            drag.id === team.id && 'opacity-50',
                                            selectedId === team.id
                                                ? 'border-primary bg-primary/10 ring-2 ring-primary/30 dark:border-dark dark:bg-dark/15'
                                                : 'border-warning/20 bg-warning/5 hover:border-warning/40 hover:bg-warning/10'
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
                        <p class="px-3 pb-5 text-center text-sm text-gray-500 dark:text-gray-400">
                            모든 팀을 배치했어요
                        </p>
                    {/if}
                </section>
            {/if}

            <!-- 라운드 열: 준결승 → 결승. 좁은 화면에서는 세로로 쌓는다. -->
            <div class="bg-bg-surface dark:bg-bg-surface-dark">
                <div class={['grid gap-6 p-4', stages.length > 1 ? 'md:grid-cols-2' : 'max-w-xl']}>
                    {#each stages as { stage, matches } (stage)}
                        {@const bestOf = bracket.bestOf[stage as BracketStage]!}
                        <section aria-labelledby={`stage-${stage}`} class="flex min-w-0 flex-col gap-3">
                            <header
                                class="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border pb-2"
                            >
                                <h3 id={`stage-${stage}`} class="font-semibold">{STAGE_LABEL[stage]}</h3>
                                {#if editing}
                                    <BracketFormatControl
                                        label={STAGE_LABEL[stage]}
                                        {bestOf}
                                        disabled={busy}
                                        onchange={async (value) =>
                                            void (await run('bestOf', { stage, bestOf: String(value) }))}
                                    />
                                {:else}
                                    <span class="text-xs opacity-60">{bestOfLabel(bestOf)}</span>
                                {/if}
                            </header>
                            <div class="flex flex-1 flex-col justify-around gap-4">
                                {#each matches as match (match.key)}
                                    <BracketMatchBox
                                        {match}
                                        teams={bracket.teams}
                                        {guildId}
                                        {labelOf}
                                        {seatLabel}
                                        {editing}
                                        {selectedId}
                                        {drag}
                                        onselect={select}
                                        onplace={place}
                                    />
                                {/each}
                            </div>
                        </section>
                    {/each}
                </div>
            </div>
        </div>
    </section>
{/if}
