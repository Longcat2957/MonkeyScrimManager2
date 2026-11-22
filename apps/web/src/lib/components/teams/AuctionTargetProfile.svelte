<script lang="ts">
    import type { Snippet } from 'svelte';
    import { formatShortDate, POSITIONS } from '#lib/features/labels.ts';
    import {
        formatMmr,
        LANES,
        winRate,
        type ChampionRef,
        type FormationPlayer,
        type TargetProfile
    } from '#lib/features/scrims/formation.ts';

    // 실제 출전 기록과 본인이 등록한 선호 챔피언을 구분한다.
    let {
        player,
        profile,
        priceSummary
    }: { player: FormationPlayer; profile: TargetProfile | null; priceSummary: Snippet } = $props();

    const laneText = (key: string | null) =>
        key ? (POSITIONS.find((position) => position.key === key)?.text ?? key) : '미확인';
</script>

{#snippet champ(champion: ChampionRef)}
    {#if champion.iconUrl}
        <img
            src={champion.iconUrl}
            alt=""
            loading="lazy"
            class="size-6 shrink-0 rounded-(--radius-small) object-cover"
        />
    {:else}
        <span
            aria-hidden="true"
            class="flex size-6 shrink-0 items-center justify-center rounded-(--radius-small) bg-surface-hover text-xs"
        >
            {champion.name.slice(0, 1)}
        </span>
    {/if}
{/snippet}

{#snippet heading(title: string, aside?: string)}
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 class="text-sm font-bold tracking-tight text-ink">{title}</h4>
        {#if aside}<span class="text-xs font-medium text-muted">{aside}</span>{/if}
    </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex (스크롤바 없이도 키보드로 전적을 끝까지 읽을 수 있다.) -->
<div
    id="auction-target-profile"
    role="region"
    aria-label="후보 전적 상세"
    tabindex="0"
    class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-surface p-2 tabular-nums [scrollbar-width:none] focus-visible:-outline-offset-2"
>
    <p class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-ui">{@render priceSummary()}</p>
    {#if profile?.riot?.recent}
        {@const recent = profile.riot.recent}
        <section class="flex flex-col gap-2">
            {@render heading(`최근 솔로랭크 ${recent.games}경기`, recent.games ? '사용 횟수순' : undefined)}
            {#if recent.games}
                <ol class="divide-y divide-line border-y border-line">
                    {#each recent.champions as { champion, count } (champion.id)}
                        <li class="flex min-w-0 items-center gap-2 py-1.5 text-sm">
                            {@render champ(champion)}
                            <span class="min-w-0 flex-1 font-semibold wrap-anywhere">{champion.name}</span>
                            <span class="shrink-0">{count}회</span>
                        </li>
                    {/each}
                </ol>
            {:else}
                <p class="text-sm text-muted">최근 솔로랭크 기록이 없어요.</p>
            {/if}
        </section>
    {/if}
    {#if profile?.riot?.pending}
        <p class="text-sm text-muted">Riot 전적 갱신 중</p>
    {/if}
    {#if profile?.summary && profile.laneGames}
        {@const laneGames = profile.laneGames}
        <section class="flex flex-col gap-2">
            {@render heading(
                '포지션별 MMR',
                profile.summary.games ? `주력 포지션 ${laneText(profile.mainLane)}` : undefined
            )}
            <table class="w-full text-right text-sm">
                <thead class="border-b border-line bg-surface-2 text-xs text-muted">
                    <tr>
                        <th scope="col" class="px-2 py-1 text-left font-medium">포지션</th>
                        <th scope="col" class="px-2 py-1 font-medium">MMR</th>
                        <th scope="col" class="px-2 py-1 font-medium">시즌 출전</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-line">
                    {#each LANES as lane (lane)}
                        <tr>
                            <th scope="row" class="px-2 py-1 text-left font-medium text-role-gold">
                                {laneText(lane)}
                            </th>
                            <td class="px-2 py-1 font-brand font-bold">{formatMmr(player.mmr[lane])}</td>
                            <td class="px-2 py-1 text-ink-2">{laneGames[lane]}게임</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            {#if !profile.summary.games}
                <p class="text-sm text-muted">이 내전과 같은 시즌의 기록이 없어요.</p>
            {/if}
        </section>
    {/if}

    {#if profile?.summary?.games}
        <section class="flex flex-col gap-2">
            {@render heading('내전 주력 챔피언')}
            <ul class="divide-y divide-line border-y border-line">
                {#each profile.championRecords as record (record.champion.id)}
                    <li class="flex items-center gap-2 py-2">
                        {@render champ(record.champion)}
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="text-sm font-semibold wrap-anywhere">{record.champion.name}</span>
                            <span class="text-xs text-muted"
                                >{record.games}게임 · {record.wins}승 {record.games - record.wins}패</span
                            >
                        </span>
                        <span class="shrink-0 font-brand text-sm font-bold tabular-nums"
                            >{winRate(record.games, record.wins)}</span
                        >
                    </li>
                {:else}
                    <li class="py-2 text-sm text-muted">확인된 챔피언 기록이 없어요.</li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if profile?.preferredChampions.length}
        <section class="flex flex-col gap-2">
            {@render heading(
                '선호 챔피언',
                profile.preferredChampionPosition
                    ? `직접 등록 · ${laneText(profile.preferredChampionPosition)}`
                    : '직접 등록'
            )}
            <ul class="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {#each profile.preferredChampions as champion (champion.id)}
                    <li class="flex min-w-0 items-center gap-2 rounded-small bg-surface-2 p-2">
                        {@render champ(champion)}
                        <span class="min-w-0 text-sm font-semibold wrap-anywhere">{champion.name}</span>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if profile?.recentGames.length}
        {@const recentWins = profile.recentGames.filter((game) => game.win).length}
        {@const chronologyKnown = profile.recentChronologyKnown !== false}
        <section class="flex flex-col gap-2">
            {@render heading(
                chronologyKnown ? '최근 게임' : '게임 기록',
                chronologyKnown ? `${recentWins}승 ${profile.recentGames.length - recentWins}패` : undefined
            )}
            {#if chronologyKnown}
                <span aria-hidden="true" class="flex gap-0.5">
                    {#each profile.recentGames as game (game.id)}
                        <span
                            class={['h-1.5 flex-1 rounded-full', game.win ? 'bg-success/80' : 'bg-error/70']}
                        ></span>
                    {/each}
                </span>
            {/if}
            <ul class="divide-y divide-line border-y border-line">
                {#each profile.recentGames as game (game.id)}
                    <li class="flex items-center gap-2 py-2">
                        {@render champ(game.champion)}
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="text-sm font-semibold wrap-anywhere">{game.champion.name}</span>
                            <span class="text-xs text-muted"
                                >{laneText(game.lane)} · {game.playedAt
                                    ? formatShortDate(game.playedAt)
                                    : '시각 미확인'}</span
                            >
                        </span>
                        <span
                            class={[
                                'shrink-0 rounded-small px-1.5 py-0.5 text-xs font-semibold',
                                game.win ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                            ]}>{game.win ? '승' : '패'}</span
                        >
                    </li>
                {/each}
            </ul>
        </section>
    {/if}
</div>
