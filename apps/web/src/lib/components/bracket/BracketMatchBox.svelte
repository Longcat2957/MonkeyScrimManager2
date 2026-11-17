<script lang="ts">
    import { resolve } from '$app/paths';
    import Button from '#lib/components/common/Button.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { DragState } from '#lib/components/teams/drag.svelte.ts';
    import { MATCH_STATUS } from '#lib/features/labels.ts';
    import type { BracketMatch, BracketSide, BracketTeam } from '#lib/features/scrims/bracket.ts';
    import BracketTeamContent from './BracketTeamContent.svelte';

    type Props = {
        match: BracketMatch;
        teams: BracketTeam[];
        guildId: string;
        // 앞 경기 이름. 승자 자리를 "준결승 A 승자"처럼 표시한다.
        labelOf: (key: string) => string;
        // 배치 자리 이름(예: 준결승 A 왼쪽, 결승 직행).
        seatLabel: (seat: string) => string;
        // 배치 중이면 자리에 팀을 놓고 빼는 조작을 보여 준다. 확정 후에는 점수와 승자를 보여 준다.
        editing: boolean;
        disabled?: boolean;
        selectedId: string | null;
        drag: DragState;
        onselect: (teamId: string) => void;
        onplace: (seat: string, teamId: string | null) => void;
    };

    let {
        match,
        teams,
        guildId,
        labelOf,
        seatLabel,
        editing,
        disabled = false,
        selectedId,
        drag,
        onselect,
        onplace
    }: Props = $props();

    const teamOf = (id: string | null) => teams.find((team) => team.id === id) ?? null;
    const selectedName = $derived(teamOf(selectedId)?.name ?? '');
    // 치르지 않고 취소된 경기는 점수 대신 –를 쓴다. 상태 태그는 시작 전 경기에만 생략한다.
    const scored = $derived(match.status !== 'pending' && match.status !== 'cancelled');
</script>

{#snippet seatRow(side: BracketSide, seat: string)}
    {@const team = teamOf(side.teamId)}
    {@const label = seatLabel(seat)}
    {@const targeting = selectedId !== null && selectedId !== side.teamId}
    <div
        role="group"
        aria-label={label}
        class={[
            'flex min-h-16 items-stretch gap-1 p-1.5 transition',
            drag.over === seat ? 'bg-hex/10 ring-2 ring-hex/40 ring-inset' : ''
        ]}
        ondragover={(event) => drag.enter(event, seat)}
        ondragleave={() => drag.leave(seat)}
        ondrop={(event) => drag.drop(event, seat)}
    >
        {#if targeting}
            <button
                type="button"
                {disabled}
                class="flex min-w-0 flex-1 items-center gap-2 rounded-(--radius-small) border border-dashed border-hex/60 px-3 hover:bg-hex/5"
                onclick={() => onplace(seat, selectedId)}
            >
                {#if team}
                    <BracketTeamContent {team} />
                    <span class="shrink-0 text-xs font-semibold text-hex">교체</span>
                {:else}
                    <span class="flex-1 text-center text-sm font-semibold text-hex">여기에 배치</span>
                {/if}
                <span class="sr-only">, {selectedName} 배치 위치 {label}</span>
            </button>
        {:else if team}
            <button
                type="button"
                {disabled}
                draggable={!disabled}
                aria-pressed={selectedId === team.id}
                class={[
                    'flex min-w-0 flex-1 cursor-grab items-center rounded-(--radius-small) px-3 active:cursor-grabbing',
                    drag.id === team.id && 'opacity-50',
                    selectedId === team.id
                        ? 'bg-hex/10 text-hex ring-2 ring-hex/40'
                        : 'hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
                ]}
                ondragstart={(event) => drag.start(event, team.id)}
                ondragend={() => drag.end()}
                onclick={() => onselect(team.id)}
            >
                <BracketTeamContent {team} />
            </button>
            <Button
                variant="quiet"
                size="sm"
                injClass="min-h-11 min-w-11 px-2"
                {disabled}
                onclick={() => onplace(seat, null)}
            >
                <span aria-hidden="true" class="text-xl leading-none text-text-muted">×</span>
                <span class="sr-only">{team.name} 배치 해제</span>
            </Button>
        {:else}
            <span
                class="flex flex-1 items-center justify-center rounded-(--radius-small) border border-dashed border-brass-line text-sm text-text-muted italic"
            >
                비어 있음
            </span>
        {/if}
    </div>
{/snippet}

{#snippet resultRow(side: BracketSide, score: number, key: 'a' | 'b')}
    {@const team = teamOf(side.teamId)}
    {@const won = match.winner === key}
    <div class={['flex min-h-14 items-center gap-3 px-3 py-2', won && 'bg-success/10']}>
        <span class="flex min-w-0 flex-1 flex-col">
            <span class={['truncate text-sm', won ? 'font-bold' : 'font-medium', !team && 'opacity-50']}>
                {team?.name ?? (side.from ? `${labelOf(side.from)} 승자` : '미정')}
            </span>
            {#if team && side.from}<span class="text-xs text-text-muted">{labelOf(side.from)} 승자</span>{/if}
        </span>
        {#if won}<span class="text-xs font-semibold text-success">승</span>{/if}
        <span
            class={[
                'w-6 text-right text-xl font-semibold tabular-nums',
                won ? 'text-success' : 'text-text-muted'
            ]}>{scored ? score : '–'}</span
        >
    </div>
{/snippet}

{#snippet sideRow(side: BracketSide, score: number, key: 'a' | 'b')}
    {#if editing && side.seat}
        {@render seatRow(side, side.seat)}
    {:else}
        {@render resultRow(side, score, key)}
    {/if}
{/snippet}

<!-- 경기 한 칸: 머리(이름·상태) + 양쪽 자리. 진행·종료 경기는 경기 상세로 연결한다. -->
<article
    aria-label={match.label}
    class={['hex-panel overflow-hidden', match.status === 'in_progress' && 'border-warning/60']}
>
    <header
        class="flex min-h-9 items-center justify-between gap-2 border-b border-brass-line bg-bg-highlight/40 px-3 dark:bg-bg-highlight-dark/40"
    >
        <h4 class="text-xs font-semibold text-text-muted">{match.label}</h4>
        {#if match.status !== 'pending'}<StatusTag {...MATCH_STATUS[match.status]} />{/if}
    </header>
    {#if match.matchId}
        <a
            href={resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.matchId })}
            class="block divide-y divide-brass-line hover:bg-bg-highlight/40 dark:hover:bg-bg-highlight-dark/40"
        >
            <span class="sr-only">{match.label} 경기 상세, </span>
            {@render sideRow(match.a, match.scoreA, 'a')}
            {@render sideRow(match.b, match.scoreB, 'b')}
        </a>
    {:else}
        <div class="divide-y divide-brass-line">
            {@render sideRow(match.a, match.scoreA, 'a')}
            {@render sideRow(match.b, match.scoreB, 'b')}
        </div>
    {/if}
</article>
