<script lang="ts">
    import { untrack, type Snippet } from 'svelte';
    import { Button, Input, toast } from 'stdf';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        bestMmr,
        formatMmr,
        type AuctionTeamView,
        type FormationPlayer
    } from '#lib/features/scrims/formation.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { inputFeedback, inputLabel } from '#lib/ui/form.ts';
    import ChangeMethodButton from './ChangeMethodButton.svelte';

    type Props = {
        contextKey: string;
        teams: AuctionTeamView[];
        players: FormationPlayer[];
        editable: boolean;
        refreshAction?: Snippet;
    };

    let { contextKey, teams, players, editable, refreshAction }: Props = $props();
    const id = $props.id();

    // 같은 내전을 다시 조회해도 저장하지 않은 팀장·포인트 입력은 유지한다.
    const fromTeams = () => ({
        captains: teams.map((team) => team.captainId),
        points: teams.map((team) => String(team.startPoints))
    });
    let captains = $state<(string | null)[]>(untrack(() => fromTeams().captains));
    let points = $state<string[]>(untrack(() => fromTeams().points));
    let query = $state('');
    let pendingAction = $state<'save' | 'start' | null>(null);
    const busy = $derived(pendingAction !== null);
    let syncedContext = untrack(() => contextKey);
    let syncedTeams = untrack(() => teams.map((team) => team.id).join(','));
    let baseline = untrack(() => JSON.stringify(fromTeams()));

    $effect(() => {
        const next = fromTeams();
        const key = contextKey;
        const teamIds = teams.map((team) => team.id).join(',');
        untrack(() => {
            if (
                key !== syncedContext ||
                teamIds !== syncedTeams ||
                JSON.stringify({ captains, points }) === baseline
            ) {
                captains = next.captains;
                points = next.points;
            }
            syncedContext = key;
            syncedTeams = teamIds;
            baseline = JSON.stringify(next);
        });
    });

    const parsed = $derived(
        points.map((value) =>
            /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)) && Number(value) > 0
                ? Number(value)
                : null
        )
    );
    const dirty = $derived(
        teams.some((team, index) => team.captainId !== captains[index] || team.startPoints !== parsed[index])
    );
    const missingCaptain = $derived(captains.some((id) => !id));
    const invalidPoints = $derived(parsed.some((value) => value === null));
    const startBlocked = $derived(
        missingCaptain
            ? '모든 팀의 팀장을 정해야 해요'
            : invalidPoints
              ? '시작 포인트는 1 이상의 정수여야 해요'
              : dirty
                ? '설정을 저장해야 시작할 수 있어요'
                : null
    );
    const filtered = $derived.by(() => {
        const keyword = query.trim().toLocaleLowerCase('ko-KR');
        return keyword
            ? players.filter((player) => player.displayName.toLocaleLowerCase('ko-KR').includes(keyword))
            : players;
    });
    const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
    const playerOf = (id: string | null) => players.find((player) => player.participantId === id) ?? null;

    // 누르는 순서대로 비어 있는 첫 팀의 팀장이 되고, 다시 누르면 해제된다.
    function toggleCaptain(id: string) {
        if (!editable || busy) return;
        const index = captains.indexOf(id);
        if (index >= 0) captains[index] = null;
        else {
            const empty = captains.indexOf(null);
            if (empty >= 0) captains[empty] = id;
        }
    }

    async function save() {
        if (!editable || busy || !dirty || invalidPoints) return;
        pendingAction = 'save';
        try {
            const message = await postAction('setup', {
                teams: JSON.stringify(
                    captains.map((captainId, index) => ({ captainId, startPoints: parsed[index] }))
                )
            });
            if (message) toast.error(message);
            else {
                const next = fromTeams();
                captains = next.captains;
                points = next.points;
            }
        } finally {
            pendingAction = null;
        }
    }

    async function start() {
        if (!editable || busy || startBlocked) return;
        if (!(await confirm('경매를 시작할까요?', '경매 시작'))) return;
        if (busy || startBlocked) return;
        pendingAction = 'start';
        try {
            const message = await postAction('start', {});
            if (message) toast.error(message);
        } finally {
            pendingAction = null;
        }
    }
</script>

<!-- 준비 목표·저장/시작을 먼저 표시하고 후보와 팀 설정을 이어서 보여 준다. -->
<section
    aria-labelledby="auction-setup"
    aria-busy={busy}
    class="flex w-full min-w-0 flex-col overflow-hidden rounded-(--radius-box) border border-border bg-border"
>
    <div
        class="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-bg-surface px-4 py-3 dark:bg-bg-surface-dark"
    >
        <div class="min-w-0">
            <h2 id="auction-setup" class="text-lg font-semibold">경매 준비</h2>
            {#if editable}
                <p class="mt-1 text-sm opacity-70">
                    {startBlocked ??
                        '설정이 완성됐어요. 시작한 뒤에는 경매를 초기화해야 팀장과 시작 포인트를 바꿀 수 있어요.'}
                </p>
            {/if}
        </div>
        {#if editable}<ChangeMethodButton disabled={busy} />{/if}
        {@render refreshAction?.()}
    </div>
    {#if editable}
        <div class="grid gap-2 bg-bg-surface px-3 pb-3 sm:grid-cols-2 dark:bg-bg-surface-dark">
            <Button
                fill="lineLight"
                size="full"
                heightOut="0"
                heightIn="3"
                injClass="text-sm"
                disabled={!dirty || invalidPoints || busy}
                loading={pendingAction === 'save' ? {} : null}
                onclick={save}
            >
                {dirty ? '설정 저장' : missingCaptain ? '설정 대기' : '저장됨'}
            </Button>
            <Button
                size="full"
                heightOut="0"
                heightIn="3"
                injClass="text-sm"
                disabled={Boolean(startBlocked) || busy}
                loading={pendingAction === 'start' ? {} : null}
                onclick={start}>경매 시작</Button
            >
        </div>
    {/if}
    <div
        class={[
            'grid min-h-0 gap-px border-t border-border',
            editable && 'xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]'
        ]}
    >
        {#if editable}
            <!-- 선발 참가자 목록. 누르면 순서대로 비어 있는 팀의 팀장이 되고, 다시 누르면 해제된다. -->
            <section
                aria-labelledby="captain-candidates"
                class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-bg-surface dark:bg-bg-surface-dark"
            >
                <div class="border-b border-border px-3 py-3" {@attach inputLabel('팀장 후보 검색')}>
                    <h3 id="captain-candidates" class="text-sm font-semibold">팀장 후보</h3>
                    <p class="mt-1 text-sm opacity-70">
                        누르는 순서대로 비어 있는 팀에 배정돼요. 다시 누르면 해제돼요.
                    </p>
                    <Input
                        title="팀장 후보 검색"
                        type="search"
                        placeholder="참가자 이름"
                        bind:value={query}
                        disabled={busy}
                        clear
                    />
                </div>
                <ul
                    class="flex max-h-72 min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain p-2 xl:max-h-[32rem]"
                >
                    {#each filtered as player (player.participantId)}
                        {@const order = captains.indexOf(player.participantId)}
                        <li>
                            <button
                                type="button"
                                aria-pressed={order >= 0}
                                disabled={busy || (order < 0 && !captains.includes(null))}
                                class={[
                                    'grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border px-2 py-2 text-left transition disabled:opacity-40',
                                    order >= 0
                                        ? 'border-warning/40 bg-warning/10'
                                        : 'border-transparent bg-bg-highlight/30 hover:border-primary/25 hover:bg-primary/5 dark:bg-bg-highlight-dark/30'
                                ]}
                                onclick={() => toggleCaptain(player.participantId)}
                            >
                                <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="md" />
                                <span class="min-w-0">
                                    <span class="block truncate text-base font-semibold"
                                        >{player.displayName}</span
                                    >
                                    <span class="block truncate text-xs opacity-60"
                                        >희망 · {player.positions.map(laneText).join(' · ')} · MMR {formatMmr(
                                            bestMmr(player)
                                        )}</span
                                    >
                                </span>
                                <span class="grid min-w-16 justify-items-end gap-1">
                                    {#if player.positions[0]}<PositionIcon
                                            position={player.positions[0]}
                                            size="sm"
                                        />{/if}
                                    <span
                                        class={[
                                            'text-xs font-semibold',
                                            order >= 0 ? 'text-warning' : 'opacity-50'
                                        ]}
                                    >
                                        {order >= 0 ? `${teams[order]?.name} 팀장` : '후보'}
                                    </span>
                                </span>
                            </button>
                        </li>
                    {:else}
                        <li class="px-3 py-10 text-center text-sm opacity-60">검색 결과가 없어요</li>
                    {/each}
                </ul>
            </section>
        {/if}

        <section aria-label="팀 설정" class="min-h-0 bg-bg-surface dark:bg-bg-surface-dark">
            <div class="grid min-h-0 grid-cols-2 content-start gap-2 p-3">
                {#each teams as team, index (team.id)}
                    {@const captain = playerOf(captains[index] ?? null)}
                    {@const pointsError = parsed[index] === null ? '1 이상의 정수를 입력해 주세요' : ''}
                    {@const pointsErrorId = `${id}-points-${index}`}
                    <section
                        aria-labelledby={`setup-${team.id}`}
                        class="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 border border-border bg-bg-highlight/20 p-3 dark:bg-bg-highlight-dark/20"
                    >
                        <div class="grid gap-2">
                            <h3
                                id={`setup-${team.id}`}
                                class="text-base font-semibold text-primary dark:text-dark"
                            >
                                {team.name}
                            </h3>
                            {#if editable}
                                <div {@attach inputFeedback(pointsError, pointsErrorId)}>
                                    <Input
                                        title="시작 포인트"
                                        titlePosition="out"
                                        inputmode="numeric"
                                        placeholder="1000"
                                        bind:value={points[index]}
                                        disabled={busy}
                                        state={parsed[index] === null ? 'error' : 'theme'}
                                    >
                                        {#snippet titleChild()}
                                            <span class="text-sm font-medium"
                                                ><span class="sr-only">{team.name} </span>시작 포인트</span
                                            >
                                        {/snippet}
                                    </Input>
                                    {#if pointsError}<p
                                            id={pointsErrorId}
                                            role="alert"
                                            class="mt-1 text-sm text-error"
                                        >
                                            {pointsError}
                                        </p>{/if}
                                </div>
                            {:else}
                                <p class="text-sm">
                                    <span class="opacity-60">시작 포인트</span>
                                    <span class="font-semibold tabular-nums">{team.startPoints}P</span>
                                </p>
                            {/if}
                        </div>
                        {#if captain}
                            <div class="flex min-h-0 items-center gap-3">
                                <PlayerFace name={captain.displayName} imageUrl={captain.iconUrl} size="sm" />
                                <div class="min-w-0">
                                    <p class="truncate text-base font-semibold">{captain.displayName}</p>
                                    <p class="mt-1 truncate text-xs opacity-60">
                                        희망 · {captain.positions.map(laneText).join(' · ')}
                                    </p>
                                </div>
                            </div>
                        {:else}
                            <p
                                class="flex min-h-12 items-center justify-center border border-dashed border-border text-sm font-semibold opacity-60"
                            >
                                팀장 미지정
                            </p>
                        {/if}
                    </section>
                {/each}
            </div>
        </section>
    </div>
</section>
