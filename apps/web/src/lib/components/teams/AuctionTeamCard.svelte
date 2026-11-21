<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { bestMmr, formatMmr, TEAM_SIZE, type AuctionTeamView } from '#lib/features/scrims/formation.ts';
    import type { DragState } from './drag.svelte.ts';

    type Props = {
        team: AuctionTeamView;
        // 입찰 입력을 보여 줄지(운영자 + 진행 중인 후보가 있을 때)다.
        bidding: boolean;
        busy: boolean;
        // 현재 후보·유찰 후보를 이 패널로 끌어 놓으면 가격 없이 배치한다.
        drag: DragState;
        // 이 팀의 입찰가 입력값. 후보가 바뀌면 보드가 비운다.
        bid: string;
        onaward: (price: number) => void;
    };

    let { team, bidding, busy, drag, bid = $bindable(''), onaward }: Props = $props();

    // 같은 증감 조작을 터치와 키보드에서도 바로 사용할 수 있다.
    const STEPS = [-50, -10, 10, 50];
    const full = $derived(team.members.length >= TEAM_SIZE);
    const price = $derived(/^\d+$/.test(bid.trim()) ? Number(bid) : null);
    const overBudget = $derived(price !== null && price > team.remainingPoints);
    const bidError = $derived(
        overBudget
            ? '남은 포인트를 넘어요'
            : bid.trim() && price === null
              ? '0 이상의 정수를 입력해 주세요'
              : ''
    );
    const captain = $derived(team.members.find((member) => member.via === 'captain')?.player ?? null);
    const laneText = (key: string | undefined) =>
        POSITIONS.find((position) => position.key === key)?.text ?? '포지션 미정';

    // 첫 명단은 그대로 두고, 이후 새로 낙찰·배치된 행만 한 번 강조한다.
    let mounted = $state(false);
    onMount(() => {
        mounted = true;
    });

    function adjust(delta: number) {
        if (busy || !bidding || full) return;
        bid = String(Math.max(0, Math.min(team.remainingPoints, (price ?? 0) + delta)));
    }
</script>

<!-- 팀 한 칸: 이름·팀장, 남은 포인트, 인원 막대, 입찰 입력, 팀원. 작업판 안에서 다른 팀과 1px 경계로 붙는다. -->
<section
    aria-labelledby={`auction-${team.id}`}
    class={[
        'flex min-h-0 min-w-0 flex-col gap-2 p-3 transition-colors',
        drag.over === team.id ? 'bg-selected ring-2 ring-nexus ring-inset' : 'bg-surface'
    ]}
    ondragover={(event) => drag.enter(event, team.id)}
    ondragleave={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)))
            drag.leave(team.id);
    }}
    ondrop={(event) => drag.drop(event, team.id)}
>
    <header class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div class="flex min-w-0 flex-col gap-1">
            <h3 id={`auction-${team.id}`} class="flex min-w-0 items-center gap-1.5">
                <span
                    class="max-w-[60%] truncate rounded-small bg-surface-2 px-1.5 py-0.5 text-ui font-bold text-ink"
                    >{team.name}</span
                >
                <span class="truncate text-base font-semibold tracking-tight"
                    >{captain?.displayName ?? '팀장 미지정'}</span
                >
            </h3>
            <span class="text-xs text-muted tabular-nums">시작 {team.startPoints}P</span>
        </div>
        <span class="shrink-0 text-right">
            <strong class="font-brand text-xl leading-none font-bold tabular-nums"
                >{team.remainingPoints}<span class="ml-0.5 text-xs">P</span></strong
            >
            <span class="block text-xs text-muted">남음</span>
        </span>
    </header>

    <div class="flex items-center gap-2">
        <span class={['shrink-0 text-xs font-medium tabular-nums', full ? 'text-success' : 'text-muted']}
            >인원 {team.members.length}/{TEAM_SIZE}</span
        >
        <span aria-hidden="true" class="grid flex-1 grid-cols-5 gap-1">
            {#each Array.from({ length: TEAM_SIZE }, (_, index) => index) as index (index)}
                <span
                    class={[
                        'h-1.5 rounded-small border',
                        index < team.members.length
                            ? full
                                ? 'border-success bg-success'
                                : 'border-nexus bg-nexus'
                            : 'border-line bg-surface-2'
                    ]}
                ></span>
            {/each}
        </span>
    </div>

    {#if bidding && !full}
        <!-- 입찰 줄은 경매 중 가장 자주 누르는 곳이라 다른 조작보다 크게 둔다. -->
        <div
            class={[
                '-mx-3 flex flex-col gap-1.5 border-y border-line px-3 py-2',
                drag.id && 'pointer-events-none',
                drag.over === team.id ? 'bg-transparent' : 'bg-surface-2'
            ]}
        >
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <div
                    class="min-w-0 [&_input]:bg-surface [&_input]:text-base [&_input]:font-semibold [&_input]:tabular-nums [&_input:enabled:not([aria-invalid]):hover]:border-nexus"
                >
                    <TextField
                        label={`${team.name} 입찰가`}
                        inputmode="numeric"
                        placeholder="입찰가"
                        bind:value={bid}
                        disabled={busy}
                        error={bidError}
                    />
                </div>
                <Button
                    variant="primary"
                    class="px-4 text-sm"
                    disabled={busy || price === null || overBudget}
                    onclick={() => price !== null && onaward(price)}
                >
                    낙찰<span class="sr-only"> {team.name}</span>
                </Button>
            </div>
            <div role="group" aria-label={`${team.name} 입찰가 조정`} class="grid grid-cols-4 gap-1">
                {#each STEPS as step (step)}
                    <Button
                        variant="secondary"
                        class="w-full px-1 font-brand text-sm font-bold tabular-nums"
                        disabled={busy}
                        onclick={() => adjust(step)}
                    >
                        {step > 0 ? '+' : '−'}{Math.abs(step)}<span class="sr-only">
                            {team.name} 입찰가 {Math.abs(step)}포인트 {step > 0 ? '올리기' : '내리기'}</span
                        >
                    </Button>
                {/each}
            </div>
        </div>
    {/if}

    <ul
        class={[
            'flex min-h-0 flex-col divide-y divide-line overflow-y-auto',
            (!bidding || full) && 'border-t border-line'
        ]}
        aria-label={`${team.name} 팀원`}
    >
        {#each team.members as member (`${member.player.participantId}:${member.via}:${member.price}`)}
            {@const placed = untrack(() => mounted && member.via !== 'captain')}
            <li class="flex items-center gap-2.5 px-1 py-1.5" class:workflow-change={placed}>
                <PlayerFace name={member.player.displayName} imageUrl={member.player.iconUrl} size="sm" />
                <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-sm font-semibold">{member.player.displayName}</span>
                    <span class="truncate text-xs text-muted tabular-nums"
                        >{laneText(member.player.positions[0])} · MMR {formatMmr(
                            bestMmr(member.player)
                        )}</span
                    >
                </span>
                <span
                    class={[
                        'shrink-0 rounded-sm px-1.5 py-0.5 text-right text-xs font-semibold tabular-nums',
                        member.via === 'captain' && 'bg-surface-2 text-ink-2',
                        member.via === 'auction' && 'font-brand text-ui text-ink-2',
                        member.via === 'manual' && 'bg-info/10 text-info'
                    ]}
                >
                    {member.via === 'captain'
                        ? '팀장'
                        : member.via === 'manual'
                          ? '수동'
                          : `${member.price}P`}
                </span>
            </li>
        {:else}
            <li class="py-3 text-center text-sm text-muted">아직 없음</li>
        {/each}
    </ul>
</section>
