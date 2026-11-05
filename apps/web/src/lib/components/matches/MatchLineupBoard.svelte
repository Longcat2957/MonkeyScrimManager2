<script lang="ts">
    import { Button } from 'stdf';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { DragState } from '#lib/components/teams/drag.svelte.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import type { MatchOperationContext } from '#lib/features/matches/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';

    let { operation }: { operation: MatchOperationContext } = $props();
    let assignments = $state<Record<string, LolPosition>>({});
    let selectedId = $state<string | null>(null);
    let busy = $state(false);
    let failure = $state('');
    const confirmed = $derived(operation.lineup?.status === 'confirmed');
    const editable = $derived(operation.can.editLineup && !confirmed && !busy);
    const players = $derived(operation.teams.flatMap((team) => team.players));
    const selected = $derived(players.find((player) => player.participantId === selectedId));
    const placed = $derived(Object.keys(assignments).length);
    const complete = $derived(
        operation.teams.length === 2 &&
            operation.teams.every((team) =>
                POSITIONS.every((position) =>
                    team.players.some((player) => assignments[player.participantId] === position.key)
                )
            )
    );

    $effect(() => {
        operation.revision;
        const initial =
            operation.lineup?.players ??
            players.flatMap((player) =>
                player.position ? [{ participantId: player.participantId, position: player.position }] : []
            );
        assignments = Object.fromEntries(initial.map((player) => [player.participantId, player.position]));
        selectedId = null;
    });

    function teamOf(participantId: string) {
        return operation.teams.find((team) =>
            team.players.some((player) => player.participantId === participantId)
        );
    }

    function accepts(participantId: string, target: string) {
        const [teamId, position] = target.split(':');
        return (
            teamOf(participantId)?.id === teamId &&
            (position === 'pool' || POSITIONS.some((item) => item.key === position))
        );
    }

    function move(participantId: string, target: string) {
        if (!editable || !accepts(participantId, target)) return;
        const [teamId, position] = target.split(':');
        const next = { ...assignments };
        const oldPosition = next[participantId];
        delete next[participantId];
        if (position !== 'pool') {
            const other = operation.teams
                .find((team) => team.id === teamId)
                ?.players.find(
                    (player) =>
                        player.participantId !== participantId && next[player.participantId] === position
                );
            if (other) {
                if (oldPosition) next[other.participantId] = oldPosition;
                else delete next[other.participantId];
            }
            next[participantId] = position as LolPosition;
        }
        assignments = next;
        selectedId = null;
        failure = '';
    }

    const drag = new DragState({ enabled: () => editable, accepts, ondrop: move });

    function choose(participantId: string) {
        selectedId = selectedId === participantId ? null : participantId;
    }

    async function save() {
        if (!complete || busy) return;
        busy = true;
        failure =
            (await postAction('confirmLineup', {
                expectedRevision: String(operation.revision),
                players: JSON.stringify(
                    Object.entries(assignments).map(([participantId, position]) => ({
                        participantId,
                        position
                    }))
                )
            })) ?? '';
        busy = false;
    }

    async function release() {
        if (!operation.lineup || busy) return;
        if (!(await confirm('출전 확정을 해제하고 선수·포지션을 다시 지정할까요?', '라인업 확정 해제')))
            return;
        busy = true;
        failure =
            (await postAction('releaseLineup', {
                expectedRevision: String(operation.revision),
                lineupId: operation.lineup.id
            })) ?? '';
        busy = false;
    }
</script>

<svelte:window
    onkeydown={(event) => {
        if (event.key === 'Escape') selectedId = null;
    }}
/>

<section
    aria-labelledby="lineup-heading"
    aria-busy={busy}
    class="overflow-hidden rounded-(--radius-box) border border-border"
>
    <header
        class="flex flex-wrap items-center justify-between gap-3 bg-bg-surface p-4 dark:bg-bg-surface-dark"
    >
        <div class="flex flex-wrap items-center gap-2">
            <h2 id="lineup-heading" class="font-semibold">출전 라인업</h2>
            {#if confirmed}<StatusTag text="확정" state="success" />{:else}<span class="text-sm opacity-60"
                    >{placed}/10 배치</span
                >{/if}
        </div>
        {#if operation.can.releaseLineup}
            <Button
                fill="lineLight"
                size="auto"
                heightOut="0"
                heightIn="2"
                injClass="px-3"
                loading={busy ? {} : null}
                onclick={release}>확정 해제</Button
            >
        {:else if operation.can.confirmLineup}
            <Button
                size="auto"
                heightOut="0"
                heightIn="2"
                injClass="px-4"
                disabled={!complete}
                loading={busy ? {} : null}
                onclick={save}>라인업 확정</Button
            >
        {/if}
    </header>
    {#if operation.can.editLineup && !confirmed}
        <div
            class="flex flex-col gap-3 border-t border-border bg-bg-surface px-4 py-3 dark:bg-bg-surface-dark"
        >
            <p class="text-sm opacity-70">
                선수를 끌어 포지션에 놓으세요. 선수를 누른 뒤 자리 선택도 가능해요.
            </p>
        </div>
    {/if}
    {#if failure}<p role="alert" class="border-t border-border p-4 text-sm text-error">{failure}</p>{/if}
    {#if selected}
        <p
            role="status"
            class="border-t border-border bg-bg-surface px-4 py-2 text-sm dark:bg-bg-surface-dark"
        >
            {selected.displayName} 선택됨 · Esc로 취소
        </p>
    {/if}
    <div class="grid gap-px border-t border-border bg-border md:grid-cols-2">
        {#each operation.teams as team (team.id)}
            <section
                aria-labelledby={`lineup-team-${team.id}`}
                class="min-w-0 bg-bg-surface p-3 dark:bg-bg-surface-dark"
            >
                <h3
                    id={`lineup-team-${team.id}`}
                    class="mb-3 flex items-center justify-between gap-2 font-semibold"
                >
                    <span class="min-w-0 truncate">{team.name}</span>
                </h3>
                <ol class="flex flex-col gap-2">
                    {#each POSITIONS as position (position.key)}
                        {@const target = `${team.id}:${position.key}`}
                        {@const player = team.players.find(
                            (item) => assignments[item.participantId] === position.key
                        )}
                        {@const targeting =
                            editable &&
                            selectedId !== null &&
                            selectedId !== player?.participantId &&
                            accepts(selectedId, target)}
                        <li
                            role="group"
                            aria-label={`${team.name} ${position.text}`}
                            class={[
                                'flex min-h-16 items-stretch gap-2 rounded-(--radius-form) border p-1.5',
                                drag.over === target
                                    ? 'border-primary ring-2 ring-primary/30 dark:border-dark dark:ring-dark/30'
                                    : 'border-border'
                            ]}
                            ondragover={(event) => drag.enter(event, target)}
                            ondragleave={() => drag.leave(target)}
                            ondrop={(event) => drag.drop(event, target)}
                        >
                            <span
                                class="flex w-12 shrink-0 flex-col items-center justify-center gap-1 text-xs opacity-70"
                                ><PositionIcon position={position.key} /><span>{position.text}</span></span
                            >
                            {#if editable}
                                <!-- 끌기와 선택·배치를 같은 조작 요소에서 제공한다. STDF Button은 drag 이벤트를 전달하지 않는다. -->
                                <button
                                    type="button"
                                    draggable={Boolean(player)}
                                    aria-pressed={player ? selectedId === player.participantId : undefined}
                                    disabled={!player && !targeting}
                                    class={[
                                        'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-(--radius-small) px-2 text-left',
                                        player && 'cursor-grab active:cursor-grabbing',
                                        selectedId === player?.participantId &&
                                            'bg-primary/10 dark:bg-dark/15'
                                    ]}
                                    ondragstart={(event) => {
                                        if (player) drag.start(event, player.participantId);
                                    }}
                                    ondragend={() => drag.end()}
                                    onclick={() => {
                                        if (targeting && selectedId) move(selectedId, target);
                                        else if (player) choose(player.participantId);
                                    }}
                                >
                                    <span class="flex min-w-0 flex-col"
                                        ><span class="truncate font-medium"
                                            >{player?.displayName ??
                                                (targeting ? '여기에 배치' : '미배정')}</span
                                        >{#if player?.riotId}<span class="truncate text-xs opacity-60"
                                                >{player.riotId}</span
                                            >{/if}</span
                                    >
                                    {#if targeting && player}<span class="shrink-0 text-xs">교환</span>{/if}
                                </button>
                                {#if player && !targeting}
                                    <Button
                                        fill="text"
                                        size="auto"
                                        heightOut="0"
                                        heightIn="2"
                                        injClass="px-2 text-xs"
                                        onclick={() => move(player.participantId, `${team.id}:pool`)}
                                        ><span class="sr-only">{player.displayName} </span>해제</Button
                                    >
                                {/if}
                            {:else}
                                <span class="flex min-w-0 flex-1 flex-col justify-center px-2"
                                    ><span class="truncate font-medium"
                                        >{player?.displayName ?? '미배정'}</span
                                    >{#if player?.riotId}<span class="truncate text-xs opacity-60"
                                            >{player.riotId}</span
                                        >{/if}</span
                                >
                            {/if}
                        </li>
                    {/each}
                </ol>
                {#if editable && (team.players.some((player) => !assignments[player.participantId]) || (drag.id && teamOf(drag.id)?.id === team.id))}
                    <div
                        role="group"
                        aria-label={`${team.name} 미배정 선수`}
                        class={[
                            'mt-3 flex min-h-12 flex-wrap items-center gap-2 rounded-(--radius-form) border border-dashed p-2',
                            drag.over === `${team.id}:pool`
                                ? 'border-primary dark:border-dark'
                                : 'border-border'
                        ]}
                        ondragover={(event) => drag.enter(event, `${team.id}:pool`)}
                        ondragleave={() => drag.leave(`${team.id}:pool`)}
                        ondrop={(event) => drag.drop(event, `${team.id}:pool`)}
                    >
                        {#each team.players.filter((player) => !assignments[player.participantId]) as player (player.participantId)}
                            <button
                                type="button"
                                draggable="true"
                                aria-pressed={selectedId === player.participantId}
                                class={[
                                    'min-h-10 min-w-0 rounded-(--radius-small) border px-3 py-2 text-sm',
                                    selectedId === player.participantId
                                        ? 'border-primary bg-primary/10 dark:border-dark dark:bg-dark/15'
                                        : 'border-border'
                                ]}
                                ondragstart={(event) => drag.start(event, player.participantId)}
                                ondragend={() => drag.end()}
                                onclick={() => choose(player.participantId)}>{player.displayName}</button
                            >
                        {:else}<span class="text-xs opacity-60">여기에 놓아 배치 해제</span>{/each}
                    </div>
                {/if}
            </section>
        {/each}
    </div>
</section>
