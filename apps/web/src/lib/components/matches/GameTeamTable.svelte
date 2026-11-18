<script lang="ts">
    import { resolve } from '$app/paths';
    import Button from '#lib/components/common/Button.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { formatNumber, formatThousands, kdaRatio, perMinute } from '#lib/features/matches/format.ts';
    import type { GamePlayer, GameSide, MatchOperationContext } from '#lib/features/matches/types.ts';
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

    // 실출전자 키와 확정 라인업이 일치할 때만 포지션을 맞춘다. 나머지는 각 진영의 기록 순서다.
    const roles = $derived(
        new Map(
            (lineup?.status === 'confirmed' ? lineup.players : []).map(
                (entry) => [entry.participantId, entry.position] as const
            )
        )
    );
    const positions = $derived(
        POSITIONS.filter((pos) =>
            sides.some((side) => side.players.some((player) => roles.get(player.key) === pos.key))
        )
    );
    const teams = $derived(
        sides.map((side) => ({
            side,
            rows: [
                ...positions.map((position) => ({
                    position,
                    player: side.players.find((player) => roles.get(player.key) === position.key)
                })),
                ...side.players
                    .filter((player) => !roles.has(player.key))
                    .map((player) => ({ position: null, player }))
            ]
        }))
    );
    const tracks = $derived(1 + Math.max(0, ...teams.map(({ rows }) => rows.length)));

    function total(side: GameSide, key: 'kills' | 'deaths' | 'assists' | 'gold') {
        if (!side.players.length || side.players.some((player) => player[key] === null)) return null;
        return side.players.reduce((sum, player) => sum + player[key]!, 0);
    }
</script>

<div class="grid min-w-0 grid-cols-2 gap-x-px bg-line" style:--tracks={tracks}>
    {#each teams as { side, rows } (side.side)}
        {@const sideName = side.side === 'blue' ? '블루' : '레드'}
        <table class="side-sheet @container/side min-w-0 bg-surface">
            <caption class="sr-only">{sideName} {side.teamName} 선수</caption>
            <thead class="contents">
                <tr
                    class={[
                        'block min-w-0 border-b border-line p-2.5 text-left sm:p-4',
                        side.side === 'blue' ? 'bg-team-blue/5' : 'bg-team-red/5'
                    ]}
                >
                    <th scope="col" class="block font-normal">
                        <span class="flex flex-wrap items-baseline gap-x-2">
                            <span
                                class={[
                                    'text-xs font-bold',
                                    side.side === 'blue' ? 'text-team-blue' : 'text-team-red'
                                ]}>{sideName}</span
                            >
                            <strong class="break-words text-base">{side.teamName}</strong>
                            <span class={['text-xs', side.win ? 'font-bold text-success' : 'text-muted']}
                                >{side.win ? '승리' : '패배'}</span
                            >
                        </span>
                        <span class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
                            <span
                                ><strong class="font-brand text-xl">{total(side, 'kills') ?? '-'}</strong> 킬</span
                            >
                            <span class="text-ink-2"
                                >{total(side, 'deaths') ?? '-'} D · {total(side, 'assists') ?? '-'} A</span
                            >
                            <span class="text-role-gold">{formatNumber(total(side, 'gold'))} 골드</span>
                        </span>
                    </th>
                </tr>
            </thead>
            <tbody class="contents">
                {#each rows as { position, player } (position?.key ?? player!.key)}
                    <tr class="block min-w-0 border-b border-line last:border-b-0">
                        <td class="block min-w-0 px-2.5 py-2.5 sm:px-4">
                            {#if position}
                                <span class="mb-1 inline-flex items-center gap-1 text-xs text-role-gold"
                                    ><PositionIcon position={position.key} size="sm" />{position.text}</span
                                >
                            {/if}
                            {#if player}
                                <div
                                    class="grid min-w-0 gap-x-3 gap-y-1.5 @min-[22rem]/side:grid-cols-[minmax(0,1fr)_auto]"
                                >
                                    <div class="flex min-w-0 items-center gap-2">
                                        {#if player.champion.iconUrl}
                                            <img
                                                class="size-7 shrink-0 rounded-small @min-[16rem]/side:size-10"
                                                src={player.champion.iconUrl}
                                                alt=""
                                            />
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
                                                <span class="break-words text-ui font-semibold"
                                                    >{player.displayName}</span
                                                >
                                            {/if}
                                            {#if player.badge}<span
                                                    class="text-micro font-bold text-role-gold"
                                                    >{player.badge.toUpperCase()}</span
                                                >{/if}
                                            {#if player.fearlessViolation}<StatusTag
                                                    text="피어리스"
                                                    state="warning"
                                                />{/if}
                                            <p class="break-words text-xs text-muted">
                                                {player.champion.name}{player.level === null
                                                    ? ''
                                                    : ` · Lv.${player.level}`}
                                            </p>
                                            {#if player.riotId}<p class="break-words text-xs text-muted">
                                                    {player.riotId}
                                                </p>{/if}
                                        </div>
                                    </div>
                                    <div class="min-w-0 text-xs tabular-nums @min-[22rem]/side:text-right">
                                        <span class="block text-ui font-semibold"
                                            ><span class="sr-only">KDA </span>{player.kills ?? '-'} / {player.deaths ??
                                                '-'} / {player.assists ?? '-'}</span
                                        >
                                        <span class="text-muted">KDA {kdaRatio(player)}</span>
                                        {#if player.score !== null}<span class="text-muted">
                                                · 평점 {player.score.toFixed(2)}</span
                                            >{/if}
                                    </div>
                                </div>
                                <div
                                    class="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2 tabular-nums @min-[20rem]/side:flex"
                                >
                                    <span>CS {player.cs ?? '-'} ({perMinute(player.cs, durationSec)}/분)</span
                                    >
                                    <span
                                        >시야 {player.visionScore ?? '-'} · {player.wardsPlaced ?? '-'} / {player.wardsKilled ??
                                            '-'}</span
                                    >
                                    <span class="flex items-center gap-1.5">
                                        딜량 {formatThousands(player.damage)} · 받은 피해 {formatThousands(
                                            player.damageTaken
                                        )}
                                        {#if maxDamage > 0 && player.damage !== null}
                                            <span aria-hidden="true" class="h-1 w-10 bg-surface-hover"
                                                ><span
                                                    class="block h-full bg-muted"
                                                    style:width={`${(100 * player.damage) / maxDamage}%`}
                                                ></span></span
                                            >
                                        {/if}
                                    </span>
                                </div>
                                <div class="flex flex-wrap items-center justify-between gap-x-2">
                                    <span
                                        class="mt-1 hidden flex-wrap items-center gap-1.5 @min-[20rem]/side:flex"
                                    >
                                        <span class="flex gap-0.5">
                                            {#each player.spells as spell, i (i)}<LoadoutIcon
                                                    icon={spell}
                                                    size="sm"
                                                />{/each}
                                            <LoadoutIcon icon={player.keystone} size="sm" round />
                                            <LoadoutIcon icon={player.secondaryStyle} size="sm" round />
                                        </span>
                                        <span class="flex gap-0.5"
                                            >{#each player.items as item, i (i)}<LoadoutIcon
                                                    icon={item}
                                                    size="sm"
                                                />{/each}</span
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
                    </tr>
                {/each}
            </tbody>
        </table>
    {/each}
</div>

<style>
    .side-sheet {
        display: grid;
        grid-row: span var(--tracks);
        grid-template-rows: subgrid;
    }
</style>
