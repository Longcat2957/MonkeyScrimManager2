<script lang="ts">
    import { resolve } from '$app/paths';
    import Button from '#lib/components/common/Button.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { formatNumber, formatThousands, kdaRatio, perMinute } from '#lib/features/matches/format.ts';
    import type { GamePlayer, GameSide } from '#lib/features/matches/types.ts';
    import LoadoutIcon from './LoadoutIcon.svelte';

    type Props = {
        side: GameSide;
        guildId: string;
        durationSec: number | null;
        // 두 진영 통틀어 가장 큰 피해량(입힌·받은 피해 중). 막대 길이의 기준이다.
        maxDamage: number;
        ondetail: (player: GamePlayer) => void;
    };

    let { side, guildId, durationSec, maxDamage, ondetail }: Props = $props();

    const total = (key: 'kills' | 'deaths' | 'assists' | 'gold') =>
        side.players.some((player) => player[key] === null)
            ? null
            : side.players.reduce((sum, player) => sum + (player[key] ?? 0), 0);
    const sideText = $derived(side.side === 'blue' ? '블루' : '레드');
    const bar = (value: number | null) =>
        `${maxDamage && value ? Math.min(100, Math.max(4, (value / maxDamage) * 100)) : 0}%`;
</script>

<!-- 진영 하나의 표. 모바일에서는 선수·KDA·상세 열만 보이고 나머지 열은 같은 표에서 숨긴다. -->
<section aria-labelledby={`side-${side.side}`} class="panel @container overflow-hidden">
    <header class={['panel-bar', side.side === 'blue' ? 'bg-team-blue/5' : 'bg-team-red/5']}>
        <h3
            id={`side-${side.side}`}
            class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-bold"
        >
            <span class={side.side === 'blue' ? 'text-team-blue' : 'text-team-red'}
                >{sideText} · {side.teamName}</span
            >
            <span class={['text-xs', side.win ? 'text-success' : 'text-muted']}
                >{side.win ? '승리' : '패배'}</span
            >
        </h3>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
            <span class="font-semibold text-role-gold">{formatNumber(total('gold'))} 골드</span>
            <span class="text-ink-2"
                >{total('kills') ?? '-'} K · {total('deaths') ?? '-'} D · {total('assists') ?? '-'} A</span
            >
        </div>
    </header>
    <table class="data-table text-ui [&_td:not(:first-child)]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <caption class="sr-only">{sideText} {side.teamName} {side.win ? '승리' : '패배'}</caption>
        <thead class="text-xs text-muted">
            <tr class="border-b border-line">
                <th scope="col" class="px-3 py-2 font-medium">선수</th>
                <th scope="col" class="hidden px-2 py-2 text-center font-medium @min-[34rem]:table-cell"
                    >평점</th
                >
                <th scope="col" class="px-1 py-2 text-center font-medium">KDA</th>
                <th scope="col" class="hidden px-2 py-2 text-center font-medium @min-[55rem]:table-cell"
                    >딜량 · 받은 피해</th
                >
                <th scope="col" class="hidden px-2 py-2 text-center font-medium @min-[55rem]:table-cell"
                    >시야</th
                >
                <th scope="col" class="hidden px-2 py-2 text-center font-medium @min-[42rem]:table-cell"
                    >CS</th
                >
                <th scope="col" class="hidden px-2 py-2 font-medium @min-[42rem]:table-cell">아이템</th>
                <th scope="col" class="w-12 px-1 py-2"><span class="sr-only">상세</span></th>
            </tr>
        </thead>
        <tbody>
            {#each side.players as player (player.key)}
                <tr class="border-b border-line last:border-b-0">
                    <!-- 남는 폭을 선수 칸이 가져가고, 좁으면 이름이 줄어 다른 열이 밀려나지 않게 한다. -->
                    <td class="w-full max-w-0 px-3 py-2">
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="relative shrink-0">
                                {#if player.champion.iconUrl}
                                    <img
                                        src={player.champion.iconUrl}
                                        alt=""
                                        class={[
                                            'size-9 rounded-(--radius-form)',
                                            player.badge === 'mvp' && 'ring-2 ring-warning',
                                            player.badge === 'ace' && 'ring-2 ring-role-gold'
                                        ]}
                                    />
                                {:else}
                                    <span
                                        class="flex size-9 items-center justify-center rounded-(--radius-form) bg-surface-2 text-xs"
                                        >{player.champion.name.slice(0, 2)}</span
                                    >
                                {/if}
                                {#if player.level !== null}
                                    <span
                                        class="absolute -right-1 -bottom-1 rounded-(--radius-small) bg-ink px-1 text-micro font-bold text-ground tabular-nums"
                                        >{player.level}</span
                                    >
                                {/if}
                            </span>
                            <span class="hidden shrink-0 grid-cols-2 gap-0.5 @min-[34rem]:grid">
                                <LoadoutIcon icon={player.spells[0] ?? null} size="sm" />
                                <LoadoutIcon icon={player.keystone} size="sm" round />
                                <LoadoutIcon icon={player.spells[1] ?? null} size="sm" />
                                <LoadoutIcon icon={player.secondaryStyle} size="sm" round />
                            </span>
                            <span class="flex min-w-0 flex-col">
                                <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                    {#if player.userId}
                                        <a
                                            href={resolve('/g/[guildId]/players/[userId]', {
                                                guildId,
                                                userId: player.userId
                                            })}
                                            class="truncate font-semibold hover:underline"
                                            >{player.displayName}</a
                                        >
                                    {:else}
                                        <span class="truncate font-semibold">{player.displayName}</span>
                                    {/if}
                                    {#if player.badge}
                                        <span
                                            class={[
                                                'shrink-0 rounded-(--radius-small) px-1.5 text-xs font-bold',
                                                player.badge === 'mvp'
                                                    ? 'bg-warning/15 text-warning'
                                                    : 'bg-role-gold/10 text-role-gold'
                                            ]}
                                        >
                                            {player.badge === 'mvp' ? 'MVP' : 'ACE'}
                                        </span>
                                    {/if}
                                    {#if player.fearlessViolation}<StatusTag
                                            text="피어리스"
                                            state="warning"
                                        />{/if}
                                </span>
                                <span class="truncate text-xs text-muted"
                                    >{player.riotId ? `${player.riotId} · ` : ''}{player.champion.name}</span
                                >
                            </span>
                        </div>
                    </td>
                    <td
                        class={[
                            'hidden px-2 py-2 text-center text-sm font-semibold tabular-nums @min-[34rem]:table-cell',
                            player.badge === 'mvp' && 'text-warning',
                            player.badge === 'ace' && 'text-role-gold'
                        ]}>{player.score?.toFixed(2) ?? '-'}</td
                    >
                    <td class="px-1 py-2 text-center tabular-nums">
                        <span class="block font-semibold whitespace-nowrap"
                            >{player.kills ?? '-'} / <span class="text-error">{player.deaths ?? '-'}</span> / {player.assists ??
                                '-'}</span
                        >
                        <span class="block text-xs text-muted">{kdaRatio(player)} : 1</span>
                    </td>
                    <td class="hidden px-2 py-2 @min-[55rem]:table-cell">
                        <span
                            class="grid w-28 grid-cols-[2.5rem_1fr] items-center gap-x-1.5 gap-y-1 text-xs tabular-nums"
                        >
                            <span class="text-right text-error">{formatThousands(player.damage)}</span>
                            <span class="h-1.5 rounded-full bg-surface-hover"
                                ><span
                                    class="block h-full rounded-full bg-error"
                                    style:width={bar(player.damage)}
                                ></span></span
                            >
                            <span class="text-right text-muted">{formatThousands(player.damageTaken)}</span>
                            <span class="h-1.5 rounded-full bg-surface-hover"
                                ><span
                                    class="block h-full rounded-full bg-muted"
                                    style:width={bar(player.damageTaken)}
                                ></span></span
                            >
                        </span>
                    </td>
                    <td class="hidden px-2 py-2 text-center tabular-nums @min-[55rem]:table-cell">
                        <span class="block">{player.wardsPlaced ?? '-'} / {player.wardsKilled ?? '-'}</span>
                        <span class="block text-xs text-muted">시야 {player.visionScore ?? '-'}</span>
                    </td>
                    <td class="hidden px-2 py-2 text-center tabular-nums @min-[42rem]:table-cell">
                        <span class="block">{player.cs ?? '-'}</span>
                        <span class="block text-xs text-muted">{perMinute(player.cs, durationSec)}/분</span>
                    </td>
                    <!-- 넓은 화면은 한 줄, 그보다 좁으면 4칸씩 두 줄로 접어 열 폭을 줄인다. -->
                    <td class="hidden px-2 py-2 @min-[42rem]:table-cell">
                        <span
                            class="grid grid-cols-[repeat(4,auto)] gap-0.5 @min-[64rem]:grid-cols-[repeat(7,auto)]"
                        >
                            {#each player.items as item, index (index)}<LoadoutIcon icon={item} />{/each}
                        </span>
                    </td>
                    <td class="px-1 py-2 text-right">
                        <Button
                            variant="quiet"
                            size="sm"
                            class="min-h-11 min-w-11 px-2"
                            onclick={() => ondetail(player)}
                        >
                            상세<span class="sr-only">, {player.displayName}</span>
                        </Button>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</section>
