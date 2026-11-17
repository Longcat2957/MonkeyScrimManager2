<script lang="ts">
    import Dialog from '#lib/components/common/Dialog.svelte';
    import { formatNumber, kdaRatio, perMinute } from '#lib/features/matches/format.ts';
    import type { GamePlayer } from '#lib/features/matches/types.ts';
    import LoadoutIcon from './LoadoutIcon.svelte';

    // 한 선수의 전체 수치. 표에 다 싣지 못한 주문·룬·아이템 이름과 세부 지표를 보여 준다.
    let {
        open = $bindable(false),
        player,
        durationSec
    }: { open: boolean; player: GamePlayer | null; durationSec: number | null } = $props();

    const multi = $derived(
        player
            ? [
                  ['더블킬', player.multiKills.double],
                  ['트리플킬', player.multiKills.triple],
                  ['쿼드라킬', player.multiKills.quadra],
                  ['펜타킬', player.multiKills.penta]
              ]
                  .filter(([, count]) => Number(count) > 0)
                  .map(([label, count]) => `${label} ${count}`)
                  .join(' · ') || '-'
            : '-'
    );
    const rows = $derived(
        player
            ? [
                  [
                      'KDA',
                      `${player.kills ?? '-'} / ${player.deaths ?? '-'} / ${player.assists ?? '-'} (${kdaRatio(player)})`
                  ],
                  ['챔피언 피해', formatNumber(player.damage)],
                  ['받은 피해', formatNumber(player.damageTaken)],
                  ['골드', `${formatNumber(player.gold)} (${perMinute(player.gold, durationSec)}/분)`],
                  ['CS', `${player.cs ?? '-'} (${perMinute(player.cs, durationSec)}/분)`],
                  ['시야 점수', String(player.visionScore ?? '-')],
                  [
                      '와드 설치 · 제거 · 제어 와드',
                      `${player.wardsPlaced ?? '-'} · ${player.wardsKilled ?? '-'} · ${player.controlWards ?? '-'}`
                  ],
                  ['회복 · 아군 보호막', `${formatNumber(player.heal)} · ${formatNumber(player.shield)}`],
                  ['최대 연속 킬', String(player.largestKillingSpree ?? '-')],
                  ['다중 킬', multi]
              ]
            : []
    );
</script>

<Dialog bind:open title="선수 상세">
    {#if player}
        <div class="flex flex-col gap-5">
            <header class="flex items-center gap-3">
                {#if player.champion.iconUrl}<img
                        src={player.champion.iconUrl}
                        alt=""
                        class="size-12 rounded-(--radius-form)"
                    />{/if}
                <div class="flex min-w-0 flex-1 flex-col">
                    <h3 class="text-base font-semibold break-words">{player.displayName}</h3>
                    <span class="truncate text-sm text-text-muted"
                        >{player.champion.name}{player.level !== null ? ` · 레벨 ${player.level}` : ''}</span
                    >
                </div>
            </header>
            <section class="flex flex-col gap-2">
                <h4 class="text-xs font-semibold text-text-muted">최종 세팅</h4>
                <ul class="flex flex-col gap-1.5 text-sm">
                    {#each [['주문', player.spells], ['룬', [player.keystone, player.secondaryStyle]], ['아이템', player.items.filter(Boolean)]] as const as [label, icons] (label)}
                        <li class="flex items-start gap-3">
                            <span class="w-12 shrink-0 pt-1 text-text-muted">{label}</span>
                            <span class="flex flex-wrap gap-x-3 gap-y-1.5">
                                {#each icons as icon, index (index)}
                                    <span class="flex items-center gap-1.5"
                                        ><LoadoutIcon {icon} size="sm" round={label === '룬'} /><span
                                            >{icon?.name ?? '-'}</span
                                        ></span
                                    >
                                {:else}<span class="pt-1">-</span>{/each}
                            </span>
                        </li>
                    {/each}
                </ul>
            </section>
            <section class="flex flex-col gap-2">
                <h4 class="text-xs font-semibold text-text-muted">세부 지표</h4>
                <dl class="divide-y divide-brass-line text-sm">
                    {#each rows as [label, value] (label)}
                        <div class="flex justify-between gap-4 py-2">
                            <dt class="text-text-muted">{label}</dt>
                            <dd class="text-right font-semibold tabular-nums">{value}</dd>
                        </div>
                    {/each}
                </dl>
            </section>
        </div>
    {/if}
</Dialog>
