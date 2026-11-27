<script lang="ts">
    import { resolve } from '$app/paths';
    import Button from '#lib/components/common/Button.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { formatNumber, formatThousands, kdaRatio, perMinute } from '#lib/features/matches/format.ts';
    import type { GamePlayer, GameSide, MatchOperationContext } from '#lib/features/matches/types.ts';
    import { SET_TITLES } from '#lib/features/matches/titles.ts';
    import LoadoutIcon from './LoadoutIcon.svelte';

    let {
        sides,
        lineup,
        guildId,
        durationSec,
        maxDamage,
        ondetail
    }: {
        sides: GameSide[];
        lineup: MatchOperationContext['lineup'];
        guildId: string;
        durationSec: number | null;
        maxDamage: number;
        ondetail: (player: GamePlayer) => void;
    } = $props();

    // 시리즈 점수판과 같은 방향을 유지하도록 A팀을 항상 왼쪽에 둔다. 세트의 실제 진영은 칩과 배경색으로 표시한다.
    const teams = $derived([...sides].sort((x, y) => x.slot.localeCompare(y.slot)));
    // 실출전자 키와 확정 라인업이 일치할 때만 포지션을 맞춘다. 나머지는 각 진영의 기록 순서대로 짝짓는다.
    const roles = $derived(
        new Map(
            (lineup?.status === 'confirmed' ? lineup.players : []).map(
                (entry) => [entry.participantId, entry.position] as const
            )
        )
    );
    const lanes = $derived.by(() => {
        const positioned = POSITIONS.filter((pos) =>
            teams.some((team) => team.players.some((player) => roles.get(player.key) === pos.key))
        ).map((position) => ({
            key: position.key as string,
            position,
            players: teams.map((team) =>
                team.players.find((player) => roles.get(player.key) === position.key)
            )
        }));
        const rest = teams.map((team) => team.players.filter((player) => !roles.has(player.key)));
        const unpositioned = Array.from(
            { length: Math.max(0, ...rest.map((list) => list.length)) },
            (_, i) => ({
                key: `order-${i}`,
                position: null,
                players: rest.map((list) => list[i])
            })
        );
        return [...positioned, ...unpositioned];
    });
    const sideName = (side: GameSide) => (side.side === 'blue' ? '블루' : '레드');

    function total(side: GameSide, key: 'kills' | 'deaths' | 'assists' | 'gold') {
        if (!side.players.length || side.players.some((player) => player[key] === null)) return null;
        return side.players.reduce((sum, player) => sum + player[key]!, 0);
    }

    // 표시 이름에 Riot ID가 이미 들어 있으면 같은 내용을 한 줄 더 쓰지 않는다.
    const showRiotId = (player: GamePlayer) =>
        player.riotId !== null && !player.displayName.toLowerCase().includes(player.riotId.toLowerCase());
</script>

{#snippet sideChip(side: GameSide)}
    <span class={['side-chip', side.side === 'blue' ? 'side-chip-blue' : 'side-chip-red']}
        >{sideName(side)}</span
    >
{/snippet}

{#snippet playerCell(side: GameSide, player: GamePlayer | undefined)}
    <td
        class={[
            'cell @container/side min-w-0 px-3 py-2.5 sm:px-4',
            side.side === 'blue' ? 'bg-team-blue/4' : 'bg-team-red/4'
        ]}
    >
        <!-- 좁은 화면에서는 한 포지션 안에 두 팀이 위아래로 놓이므로 칸마다 팀을 밝힌다. -->
        <span class="narrow-only mb-1.5 items-center gap-1.5 text-xs font-semibold text-ink-2">
            {@render sideChip(side)}{side.teamName}
        </span>
        {#if player}
            <div class="grid min-w-0 gap-x-3 gap-y-1.5 @min-[20.5rem]/side:grid-cols-[minmax(0,1fr)_auto]">
                <div class="flex min-w-0 items-center gap-2.5">
                    {#if player.champion.iconUrl}
                        <img class="size-10 shrink-0 rounded-small" src={player.champion.iconUrl} alt="" />
                    {/if}
                    <div class="min-w-0">
                        {#if player.userId}
                            <a
                                href={resolve('/g/[guildId]/players/[userId]', {
                                    guildId,
                                    userId: player.userId
                                })}
                                class="break-words text-ui font-semibold hover:underline"
                                >{player.displayName}</a
                            >
                        {:else}
                            <span class="break-words text-ui font-semibold">{player.displayName}</span>
                        {/if}
                        {#if player.badge}<span class="text-micro font-bold text-role-gold"
                                >{player.badge.toUpperCase()}</span
                            >{/if}
                        {#if player.fearlessViolation}<StatusTag text="피어리스" state="warning" />{/if}
                        <p class="break-words text-xs text-muted">
                            {player.champion.name}{player.level === null ? '' : ` · Lv.${player.level}`}
                        </p>
                        {#if showRiotId(player)}<p class="break-words text-xs text-muted">
                                {player.riotId}
                            </p>{/if}
                    </div>
                </div>
                <div
                    class="flex min-w-0 items-baseline gap-2 text-xs tabular-nums @min-[20.5rem]/side:block @min-[20.5rem]/side:text-right"
                >
                    <span class="block text-ui font-semibold"
                        ><span class="sr-only">킬·데스·어시스트 </span>{player.kills ?? '-'} / {player.deaths ??
                            '-'} / {player.assists ?? '-'}</span
                    >
                    <span class="text-muted">KDA {kdaRatio(player)}</span>
                    {#if player.score !== null}<span class="text-muted">
                            · 평점 {player.score.toFixed(0)}</span
                        >{/if}
                </div>
            </div>
            {#if player.titles.length}
                <ul aria-label="세트 칭호" class="mt-2 space-y-1 text-xs">
                    {#each player.titles as title (title.id)}
                        <li class="flex flex-wrap items-baseline gap-x-2">
                            <strong class="break-words">{SET_TITLES[title.id].name}</strong>
                            <span class="text-muted tabular-nums">
                                {SET_TITLES[title.id].metric}
                                {Number(title.value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                            </span>
                        </li>
                    {/each}
                </ul>
            {/if}
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2 tabular-nums">
                <span
                    >CS {player.cs ?? '-'}
                    <span class="text-muted">({perMinute(player.cs, durationSec)}/분)</span></span
                >
                <span
                    >시야 {player.visionScore ?? '-'} · {player.wardsPlaced ?? '-'} / {player.wardsKilled ??
                        '-'}</span
                >
                <span class="flex items-center gap-1.5">
                    딜량 {formatThousands(player.damage)} · 받은 피해 {formatThousands(player.damageTaken)}
                    {#if maxDamage > 0 && player.damage !== null}
                        <span
                            aria-hidden="true"
                            class="h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover"
                            ><span
                                class={[
                                    'block h-full rounded-full',
                                    side.side === 'blue' ? 'bg-team-blue' : 'bg-team-red'
                                ]}
                                style:width={`${(100 * player.damage) / maxDamage}%`}
                            ></span></span
                        >
                    {/if}
                </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="flex flex-wrap items-center gap-1.5">
                    <span class="flex gap-0.5">
                        {#each player.spells as spell, i (i)}<LoadoutIcon icon={spell} size="sm" />{/each}
                        <LoadoutIcon icon={player.keystone} size="sm" round />
                        <LoadoutIcon icon={player.secondaryStyle} size="sm" round />
                    </span>
                    <span class="flex gap-0.5"
                        >{#each player.items as item, i (i)}<LoadoutIcon icon={item} size="sm" />{/each}</span
                    >
                </span>
                <Button
                    variant="quiet"
                    size="sm"
                    class="ml-auto min-h-11 min-w-11"
                    onclick={() => ondetail(player)}
                >
                    상세<span class="sr-only">, {player.displayName}</span>
                </Button>
            </div>
        {:else}
            <span class="text-muted">–</span>
        {/if}
    </td>
{/snippet}

<!-- 넓으면 A팀·포지션·B팀 세 열로 같은 포지션을 한 행에 맞추고, 좁으면 포지션마다 두 팀을 위아래로 쌓는다. -->
<div class="@container/sheet min-w-0">
    <table class="lane-table w-full min-w-0 bg-surface">
        <caption class="sr-only"
            >{teams.map((team) => `${sideName(team)} ${team.teamName}`).join(' 대 ')} 선수 비교</caption
        >
        <thead>
            <tr class="lane-row border-b border-line">
                <td class="lane-label" aria-hidden="true"></td>
                {#each teams as team (team.slot)}
                    <th
                        scope="col"
                        class={[
                            'cell min-w-0 px-3 py-3 text-left font-normal sm:px-4',
                            team.side === 'blue' ? 'bg-team-blue/8' : 'bg-team-red/8'
                        ]}
                    >
                        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {@render sideChip(team)}
                            <strong class={['break-words text-base', !team.win && 'text-ink-2']}
                                >{team.teamName}</strong
                            >
                            <span class={['text-xs', team.win ? 'font-bold text-success' : 'text-muted']}
                                >{team.win ? '승리' : '패배'}</span
                            >
                        </span>
                        <span
                            class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-2 tabular-nums"
                        >
                            <span
                                ><strong class="font-brand text-xl text-ink"
                                    >{total(team, 'kills') ?? '-'}</strong
                                >
                                / {total(team, 'deaths') ?? '-'} / {total(team, 'assists') ?? '-'}</span
                            >
                            <span class="text-muted">킬·데스·어시스트</span>
                            <span class="text-role-gold">골드 {formatNumber(total(team, 'gold'))}</span>
                        </span>
                    </th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each lanes as lane, index (lane.key)}
                <tr class="lane-row border-b border-line last:border-b-0">
                    <th scope="row" class="lane-label px-3 pt-2.5 text-xs font-semibold text-role-gold">
                        {#if lane.position}
                            <span class="inline-flex items-center gap-1"
                                ><PositionIcon position={lane.position.key} size="sm" />{lane.position
                                    .text}</span
                            >
                        {:else}
                            <span class="sr-only">기록 순서 {index + 1}</span>
                        {/if}
                    </th>
                    {#each teams as team, i (team.slot)}
                        {@render playerCell(team, lane.players[i])}
                    {/each}
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .side-chip {
        display: inline-flex;
        align-items: center;
        border-radius: var(--radius-small);
        padding: 0 0.4375rem;
        font-size: 0.6875rem;
        font-weight: 700;
        line-height: 1.25rem;
    }
    .side-chip-blue {
        background: color-mix(in oklab, var(--color-team-blue) 16%, transparent);
        color: var(--color-team-blue);
    }
    .side-chip-red {
        background: color-mix(in oklab, var(--color-team-red) 16%, transparent);
        color: var(--color-team-red);
    }
    .lane-table,
    .lane-table > thead,
    .lane-table > tbody {
        display: block;
    }
    .lane-row {
        display: flex;
        flex-direction: column;
    }
    .cell {
        display: block;
    }
    .narrow-only {
        display: flex;
    }
    /* 머리 행의 빈 포지션 칸은 좁은 화면에서 자리를 차지하지 않는다. */
    thead .lane-label {
        display: none;
    }
    @container sheet (min-width: 44rem) {
        .lane-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 4.5rem minmax(0, 1fr);
        }
        /* 칸 순서는 포지션 → A팀 → B팀이며, 넓은 화면에서만 포지션을 가운데 열로 옮긴다. */
        .lane-row > .cell:nth-child(2) {
            grid-column: 1;
            grid-row: 1;
        }
        .lane-row > .cell:nth-child(3) {
            grid-column: 3;
            grid-row: 1;
        }
        .lane-label,
        thead .lane-label {
            display: flex;
            grid-column: 2;
            grid-row: 1;
            align-items: center;
            justify-content: center;
            padding: 0;
            border-inline: 1px solid var(--color-line);
        }
        .narrow-only {
            display: none;
        }
    }
</style>
