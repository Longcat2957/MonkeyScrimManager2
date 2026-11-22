<script lang="ts">
    import { tick, untrack, type Snippet } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import { toast } from '#lib/ui/toast.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        bestMmr,
        formatMmr,
        type AuctionTeamView,
        type FormationPlayer
    } from '#lib/features/scrims/formation.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import CaptainPinball from './CaptainPinball.svelte';
    import ChangeMethodButton from './ChangeMethodButton.svelte';

    type Props = {
        contextKey: string;
        teams: AuctionTeamView[];
        players: FormationPlayer[];
        editable: boolean;
        refreshAction?: Snippet;
    };

    let { contextKey, teams, players, editable, refreshAction }: Props = $props();

    // 같은 내전을 다시 조회해도 저장하지 않은 팀장·포인트 입력은 유지한다.
    const fromTeams = () => ({
        captains: teams.map((team) => team.captainId),
        points: teams.map((team) => String(team.startPoints))
    });
    let captains = $state<(string | null)[]>(untrack(() => fromTeams().captains));
    let points = $state<string[]>(untrack(() => fromTeams().points));
    // 추첨으로 배정했지만 아직 저장하지 않은 팀장만 다음 추첨에 다시 참가한다.
    let drawn = $state.raw<string[]>([]);
    let query = $state('');
    let setupControls = $state<HTMLDivElement>();
    let pendingAction = $state<'save' | 'start' | null>(null);
    const busy = $derived(pendingAction !== null);
    const teamContext = $derived(JSON.stringify([contextKey, teams.map((team) => team.id)]));
    let syncedContext = untrack(() => teamContext);
    let baseline = untrack(fromTeams);

    $effect(() => {
        const next = fromTeams();
        const key = teamContext;
        const roster = new Set(players.map((player) => player.participantId));
        untrack(() => {
            if (key !== syncedContext) {
                captains = next.captains;
                points = next.points;
                drawn = [];
            } else {
                // 다른 운영자가 저장한 팀장은 우선하고, 명단에서 빠진 후보의 초안만 해제한다.
                const confirmed = new Set(next.captains.filter((id, i) => id !== baseline.captains[i]));
                captains = captains.map((id, i) => {
                    const saved = next.captains[i] ?? null;
                    if (saved !== baseline.captains[i] || saved === id) return saved;
                    return id && roster.has(id) && !confirmed.has(id) ? id : null;
                });
                drawn = drawn.filter((id) => captains.includes(id) && !confirmed.has(id));
                points = points.map((value, i) => (value === baseline.points[i] ? next.points[i]! : value));
            }
            syncedContext = key;
            baseline = next;
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
    const pinned = $derived(captains.map((id) => (id && drawn.includes(id) ? null : id)));
    const drawTeams = $derived(teams.filter((_, index) => !pinned[index]));
    const drawPlayers = $derived(players.filter((player) => !pinned.includes(player.participantId)));
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
        if (index >= 0) {
            captains[index] = null;
            drawn = drawn.filter((captain) => captain !== id);
        } else {
            const empty = captains.indexOf(null);
            if (empty >= 0) captains[empty] = id;
        }
    }

    async function assignDraw(ids: string[]) {
        if (!editable || busy || ids.length !== drawTeams.length) return;
        let index = 0;
        captains = pinned.map((captain) => captain ?? ids[index++]!);
        drawn = ids;
        await tick();
        (setupControls?.querySelector<HTMLButtonElement>('button:enabled') ?? setupControls)?.focus();
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
                drawn = [];
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
<section aria-labelledby="auction-setup" aria-busy={busy} class="panel flex w-full flex-col overflow-hidden">
    <header class="panel-bar">
        <h2 id="auction-setup" class="text-lg font-bold tracking-tight">경매 준비</h2>
        <div class="flex flex-wrap items-center gap-1">
            {#if editable}<ChangeMethodButton disabled={busy} />{/if}
            {@render refreshAction?.()}
        </div>
    </header>
    {#if editable}
        <div
            bind:this={setupControls}
            tabindex="-1"
            class="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-4 py-2.5"
        >
            <p
                class={[
                    'min-w-0 flex-[1_1_18rem] text-ui leading-relaxed',
                    startBlocked ? 'text-ink-2' : 'font-medium text-success'
                ]}
            >
                {startBlocked ??
                    '설정이 완성됐어요. 시작한 뒤에는 경매를 초기화해야 팀장과 시작 포인트를 바꿀 수 있어요.'}
            </p>
            <div class="flex flex-wrap items-center gap-2">
                <Button
                    variant="secondary"
                    disabled={!dirty || invalidPoints || busy}
                    loading={pendingAction === 'save'}
                    onclick={save}
                >
                    {dirty ? '설정 저장' : missingCaptain ? '설정 대기' : '저장됨'}
                </Button>
                <Button
                    variant="primary"
                    disabled={Boolean(startBlocked) || busy}
                    loading={pendingAction === 'start'}
                    onclick={start}>경매 시작</Button
                >
            </div>
        </div>
    {/if}
    <div
        class={[
            'grid min-h-0 gap-px border-t border-line bg-line',
            editable && 'xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]'
        ]}
    >
        {#if editable}
            <!-- 선발 참가자 목록. 누르면 순서대로 비어 있는 팀의 팀장이 되고, 다시 누르면 해제된다. -->
            <section
                aria-labelledby="captain-candidates"
                class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-surface"
            >
                <div class="border-b border-line bg-surface px-3 py-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h3 id="captain-candidates" class="text-base font-bold tracking-tight">팀장 후보</h3>
                        {#key teamContext}
                            <CaptainPinball
                                players={drawPlayers}
                                slots={drawTeams}
                                redraw={drawn.length > 0}
                                disabled={busy}
                                onassign={assignDraw}
                            />
                        {/key}
                    </div>
                    <p class="mt-1 text-ui leading-relaxed text-muted">
                        누르는 순서대로 비어 있는 팀에 배정돼요. 다시 누르면 해제돼요.
                    </p>
                    <div class="mt-2">
                        <TextField
                            label="팀장 후보 검색"
                            type="search"
                            placeholder="참가자 이름"
                            bind:value={query}
                            disabled={busy}
                        />
                    </div>
                </div>
                <ul
                    class="flex max-h-72 min-h-0 flex-col divide-y divide-line overflow-y-auto overscroll-contain xl:max-h-[32rem]"
                >
                    {#each filtered as player (player.participantId)}
                        {@const order = captains.indexOf(player.participantId)}
                        <li>
                            <button
                                type="button"
                                aria-pressed={order >= 0}
                                disabled={busy || (order < 0 && !captains.includes(null))}
                                class={[
                                    'grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:-outline-offset-2 disabled:opacity-50',
                                    order >= 0 ? 'bg-selected' : 'enabled:hover:bg-surface-hover'
                                ]}
                                onclick={() => toggleCaptain(player.participantId)}
                            >
                                <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
                                <span class="min-w-0">
                                    <span class="block truncate text-sm font-semibold"
                                        >{player.displayName}</span
                                    >
                                    <span class="block truncate text-xs text-muted tabular-nums"
                                        >희망 · {player.positions.map(laneText).join(' · ')} · MMR {formatMmr(
                                            bestMmr(player)
                                        )}</span
                                    >
                                </span>
                                <span class="grid justify-items-end">
                                    {#if player.positions[0]}<PositionIcon
                                            position={player.positions[0]}
                                            size="sm"
                                        />{/if}
                                    <span
                                        class={[
                                            'rounded-small text-xs font-semibold',
                                            order >= 0
                                                ? 'bg-nexus px-1.5 py-0.5 text-nexus-ink'
                                                : 'text-muted'
                                        ]}
                                    >
                                        {order >= 0 ? `${teams[order]?.name} 팀장` : '후보'}
                                    </span>
                                </span>
                            </button>
                        </li>
                    {:else}
                        <li class="px-3 py-10 text-center text-sm text-muted">검색 결과가 없어요</li>
                    {/each}
                </ul>
            </section>
        {/if}

        <section aria-label="팀 설정" class="min-h-0 bg-surface-2">
            <div class="grid min-h-0 content-start gap-2 p-2 min-[23rem]:grid-cols-2">
                {#each teams as team, index (team.id)}
                    {@const captain = playerOf(captains[index] ?? null)}
                    {@const pointsError = parsed[index] === null ? '1 이상의 정수를 입력해 주세요' : ''}
                    <section
                        aria-labelledby={`setup-${team.id}`}
                        class="panel grid grid-rows-[auto_minmax(0,1fr)] gap-3 p-3"
                    >
                        <div class="grid gap-2">
                            <h3
                                id={`setup-${team.id}`}
                                class="border-b border-line pb-2 text-base font-bold tracking-tight"
                            >
                                {team.name}
                            </h3>
                            {#if editable}
                                <TextField
                                    label="시작 포인트"
                                    inputmode="numeric"
                                    placeholder="1000"
                                    bind:value={points[index]}
                                    disabled={busy}
                                    error={pointsError}
                                />
                            {:else}
                                <p class="text-sm">
                                    <span class="text-muted">시작 포인트</span>
                                    <span class="font-brand text-base font-bold tabular-nums"
                                        >{team.startPoints}P</span
                                    >
                                </p>
                            {/if}
                        </div>
                        {#if captain}
                            <div class="flex min-h-10 items-center gap-2 border-t border-line pt-2">
                                <PlayerFace name={captain.displayName} imageUrl={captain.iconUrl} size="sm" />
                                <div class="min-w-0">
                                    <p class="truncate text-sm font-semibold">{captain.displayName}</p>
                                    <p class="truncate text-xs text-muted">
                                        희망 · {captain.positions.map(laneText).join(' · ')}
                                    </p>
                                </div>
                            </div>
                        {:else}
                            <p
                                class="flex min-h-10 items-center justify-center rounded-form border border-dashed border-line-strong/60 bg-surface-2 text-ui text-muted"
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
