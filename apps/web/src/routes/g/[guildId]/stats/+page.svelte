<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { Button, Grid, Grids, Stepper, Switch } from 'stdf';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import SeasonSelector from '#lib/components/common/SeasonSelector.svelte';
    import StatTile, { type StatTone } from '#lib/components/common/StatTile.svelte';
    import AchievementCarousel from '#lib/components/stats/AchievementCarousel.svelte';
    import AchievementRankingDialog from '#lib/components/stats/AchievementRankingDialog.svelte';
    import LeaderboardTable, { type LeaderboardSortKey } from '#lib/components/stats/LeaderboardTable.svelte';
    import StatsRefreshControls from '#lib/components/stats/StatsRefreshControls.svelte';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { fixed, integer } from '#lib/features/players/format.ts';
    import { formatDuration } from '#lib/features/matches/format.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';
    import { stepperLabels } from '#lib/ui/form.ts';
    import {
        normalizeStatsFilters,
        statsRequestKey,
        statsViewKey,
        type StatsSnapshot
    } from '#lib/features/stats/types.ts';
    import {
        createStatsLiveController,
        type StatsLiveContext,
        type StatsLiveController,
        type StatsLiveState
    } from '#lib/ui/stats-live.ts';
    import type { PageProps } from './$types';

    let { data: loaded }: PageProps = $props();
    let liveSnapshot = $state.raw<StatsSnapshot | null>(null);
    const data = $derived(liveSnapshot ?? loaded);

    const CHAMPION_PAGE = 15;
    const FILTERS = [
        { key: 'all' as const, text: '전체' },
        ...POSITIONS.map((position) => ({ key: position.key, text: position.text }))
    ];

    const guildId = $derived(page.params.guildId!);
    const changing = $derived(navigating.to?.route.id === page.route.id);
    let automatic = $state(true);
    let online = $state(true);
    let visible = $state(true);
    let receivedAt = $state<number | null>(null);
    let refreshNotice = $state('');
    let liveState = $state.raw<StatsLiveState>({
        busy: false,
        error: null,
        lastSuccessAt: null,
        nextRunAt: null
    });
    let controller = $state.raw<StatsLiveController | null>(null);
    let baseline: StatsSnapshot | null = null;
    let contextURL = '';
    let suspended = false;
    let started = false;
    let acceptedVersion = 0;

    function requestContext(href: string): StatsLiveContext {
        const url = new URL(href);
        const id = page.params.guildId!;
        const target = new URL(resolve('/g/[guildId]/stats/live', { guildId: id }), url.origin);
        const filters = normalizeStatsFilters(url.searchParams);
        if (filters.seasonId !== null) target.searchParams.set('season', filters.seasonId);
        if (filters.position !== 'all') target.searchParams.set('position', filters.position);
        if (filters.recent) target.searchParams.set('recent', '1');
        target.searchParams.set('min', String(filters.minGames));
        return {
            url: target.href,
            guildId: id,
            requestKey: statsRequestKey(id, filters)
        };
    }

    onMount(() => {
        online = navigator.onLine;
        visible = document.visibilityState !== 'hidden';
        receivedAt = Date.now();
        const client = createStatsLiveController({
            ondata: (snapshot) => {
                if (navigating.to || loaded !== baseline || !page.params.guildId) return;
                const context = requestContext(page.url.href);
                if (snapshot.guildId !== context.guildId || snapshot.requestKey !== context.requestKey)
                    return;
                liveSnapshot = snapshot;
                receivedAt = Date.now();
                acceptedVersion++;
            },
            onstate: (state) => {
                liveState = state;
                if (state.busy) refreshNotice = '';
            }
        });
        controller = client;
        const connectivity = () => (online = navigator.onLine);
        const visibility = () => (visible = document.visibilityState !== 'hidden');
        window.addEventListener('online', connectivity);
        window.addEventListener('offline', connectivity);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            window.removeEventListener('online', connectivity);
            window.removeEventListener('offline', connectivity);
            document.removeEventListener('visibilitychange', visibility);
            client.dispose();
            controller = null;
        };
    });

    $effect(() => {
        const client = controller;
        const source = loaded;
        const href = page.url.href;
        const moving = Boolean(navigating.to);
        const enabled = automatic;
        const available = visible && online;
        if (!client) return;
        // 제어기의 콜백이 바꾸는 표시 상태를 이 수명 동기화의 의존성으로 만들지 않는다.
        untrack(() => {
            const context = requestContext(href);
            if (!started) {
                baseline = source;
                contextURL = context.url;
                client.setAvailable(available && !moving);
                client.setEnabled(enabled);
                client.start(context);
                started = true;
                if (moving) client.setContext(null);
                suspended = moving;
                return;
            }
            // 상위 레이아웃 데이터만 합쳐진 경우에는 최신 통계를 이전 SSR 값으로 되돌리지 않는다.
            const replaced = source.seasons !== baseline?.seasons || context.url !== contextURL;
            baseline = source;
            if (replaced) {
                contextURL = context.url;
                liveSnapshot = null;
                receivedAt = Date.now();
                refreshNotice = '';
            }
            if (moving) {
                if (!suspended) client.setContext(null);
                client.setAvailable(false);
                client.setEnabled(enabled);
                suspended = true;
                return;
            }
            if (replaced || suspended) {
                client.setContext(null);
                client.setAvailable(available);
                client.setEnabled(enabled);
                client.setContext(context);
                suspended = false;
                return;
            }
            client.setEnabled(enabled);
            client.setAvailable(available);
        });
    });

    async function refresh() {
        if (!controller || liveState.busy || !online || !visible || navigating.to) return;
        const before = acceptedVersion;
        await controller.refresh();
        if (acceptedVersion !== before) refreshNotice = '통계를 새로 불러왔어요.';
    }

    let championPage = $state(1);
    let leaderboardSort = $state<LeaderboardSortKey>('kda');
    let leaderboardDescending = $state(true);
    let selectedAchievement = $state<string | null>(null);
    const achievementIndex = $derived(
        data.empty
            ? 0
            : Math.max(
                  0,
                  data.achievements.findIndex((item) => item.id === selectedAchievement)
              )
    );
    let rankingOpen = $state(false);
    let minGames = $state(5);
    let previousView = '';
    const viewKey = $derived(statsViewKey(data));
    $effect(() => {
        const snapshot = data;
        const key = viewKey;
        untrack(() => {
            if (key !== previousView) {
                previousView = key;
                minGames = snapshot.minGames;
                championPage = 1;
                selectedAchievement = snapshot.empty ? null : (snapshot.achievements[0]?.id ?? null);
                rankingOpen = false;
            }
            if (snapshot.empty) {
                championPage = 1;
                selectedAchievement = null;
                rankingOpen = false;
                return;
            }
            championPage = Math.min(
                championPage,
                Math.max(1, Math.ceil(snapshot.champions.length / CHAMPION_PAGE))
            );
            if (!snapshot.achievements.length) {
                selectedAchievement = null;
                rankingOpen = false;
            } else if (!snapshot.achievements.some((item) => item.id === selectedAchievement)) {
                selectedAchievement = snapshot.achievements[0]!.id;
            }
        });
    });

    function selectAchievement(index: number) {
        if (!data.empty)
            selectedAchievement = data.achievements[index]?.id ?? data.achievements[0]?.id ?? null;
    }

    function navigate(params: { position?: LolPosition | 'all'; min?: number; recent?: boolean }) {
        const url = new URL(page.url.href);
        if (params.recent !== undefined) {
            if (params.recent) url.searchParams.set('recent', '1');
            else url.searchParams.delete('recent');
        }
        if (params.position !== undefined) {
            if (params.position === 'all') url.searchParams.delete('position');
            else url.searchParams.set('position', params.position);
        }
        if (params.min !== undefined) url.searchParams.set('min', String(params.min));
        goto(url, { reset: false });
    }
</script>

<svelte:head>
    <title>통계 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold">통계</h1>
        <SeasonSelector seasons={data.seasons} selectedSeasonId={data.selectedSeasonId} />
    </header>

    <StatsRefreshControls
        state={liveState}
        {automatic}
        {online}
        moving={Boolean(navigating.to)}
        {receivedAt}
        notice={refreshNotice}
        onautomatic={(enabled) => {
            automatic = enabled;
            refreshNotice = '';
        }}
        onrefresh={refresh}
    />

    {#if data.empty}
        <SectionState
            state="empty"
            message={data.selectedSeasonId ? '이 시즌에는 기록된 게임이 없어요' : '아직 기록된 게임이 없어요'}
        />
    {:else}
        {@const kpis: [string, string, string | null, StatTone, string][] = [
			['총 게임', String(data.kpis.games), null, 'info', 'm14.5 17.5-11-11V3h3.5l11 11m-5 5 6-6m-3 3 4 4m1-1-2 2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4m-2-1-3 3m-1-1 2 2'],
			['참가자', String(data.kpis.players), '한 게임 이상 뛴 사람', 'neutral', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87m-3-12a4 4 0 0 1 0 7.75'],
			['평균 게임 시간', formatDuration(data.kpis.averageDurationSec), null, 'info', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20m0-16v6l4 2'],
			['분당 킬', fixed(data.kpis.killsPerMinute, 2), null, 'success', 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22m7-7.34V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0z'],
			['평균 KDA', fixed(data.kpis.kda, 2), '(킬+어시스트) / 데스', 'warning', 'M13 2 3 14h9l-1 8 10-12h-9z'],
			['사용한 챔피언', integer(data.kpis.champions), null, 'error', 'M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z']
		]}
        <section aria-labelledby="kpis">
            <h2 id="kpis" class="sr-only">핵심 지표</h2>
            <Grids cols={desktop.current ? '6' : '2'} gap="2" mx="0" my="0">
                {#each kpis as [label, value, note, tone, path] (label)}
                    <Grid>
                        <StatTile {label} {value} {note} {tone}>
                            {#snippet icon()}<svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"><path d={path} /></svg
                                >{/snippet}
                        </StatTile>
                    </Grid>
                {/each}
            </Grids>
        </section>

        <!-- 포지션 필터는 업적·리더보드·챔피언에 함께 적용한다. -->
        <div class="flex items-center gap-2">
            <div role="group" aria-label="포지션 필터" class="min-w-0 flex-1 border-b border-border">
                <SelectionTabs
                    labels={FILTERS.map((filter) => ({ text: filter.text }))}
                    active={FILTERS.findIndex((filter) => filter.key === data.position)}
                    onclickTab={(index) => navigate({ position: FILTERS[index]!.key })}
                />
            </div>
        </div>

        <div
            aria-busy={changing}
            class={['flex flex-col gap-8 transition-opacity', changing && 'opacity-50']}
        >
            {#if data.showAchievements}
                <section aria-labelledby="achievements" class="flex flex-col gap-3">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <h2 id="achievements" class="text-lg font-semibold">업적</h2>
                        <div class="flex items-center gap-4 text-sm">
                            <label class="flex min-h-11 cursor-pointer items-center gap-2">
                                <span
                                    >최근 10게임만<span class="sr-only"
                                        >, {data.recent ? '켜짐' : '꺼짐'}</span
                                    ></span
                                >
                                <Switch
                                    active={data.recent}
                                    inside="state"
                                    radius="full"
                                    onchange={(active) => navigate({ recent: active })}
                                />
                            </label>
                            {#if data.achievements.length}
                                <Button
                                    fill="lineLight"
                                    size="auto"
                                    heightOut="0"
                                    heightIn="2"
                                    injClass="min-h-11 px-3 text-sm"
                                    onclick={() => (rankingOpen = true)}>업적별 순위</Button
                                >
                            {/if}
                        </div>
                    </div>
                    {#if data.achievements.length}
                        <AchievementCarousel
                            items={data.achievements}
                            bind:current={() => achievementIndex, selectAchievement}
                        />
                        <p class="text-center text-xs opacity-60">
                            {data.achievementMinGames}게임 이상 뛴 사람부터 집계해요
                        </p>
                    {:else}
                        <SectionState
                            state="empty"
                            message={`${data.achievementMinGames}게임 이상 뛴 사람이 없어요`}
                        />
                    {/if}
                </section>
            {/if}

            <section aria-labelledby="leaderboard" class="flex flex-col gap-3">
                <div class="flex flex-wrap items-end justify-between gap-3">
                    <h2 id="leaderboard" class="text-lg font-semibold">리더보드</h2>
                    <div class="flex items-center gap-3 text-sm">
                        <span id="min-games-label" class="opacity-70">최소 게임</span>
                        <div
                            role="group"
                            aria-labelledby="min-games-label"
                            {@attach stepperLabels('최소 게임')}
                        >
                            <Stepper
                                bind:value={minGames}
                                min={1}
                                max={50}
                                injClassBtn="min-h-11 min-w-11"
                                onchange={(value) => navigate({ min: Number(value) })}
                            />
                        </div>
                        <span class="opacity-60 tabular-nums"
                            >{data.leaderboard.length}명 / {data.playerCount}명</span
                        >
                    </div>
                </div>
                {#if data.leaderboard.length}
                    <LeaderboardTable
                        rows={data.leaderboard}
                        {guildId}
                        seasonId={data.selectedSeasonId}
                        contextKey={viewKey}
                        bind:sortKey={leaderboardSort}
                        bind:descending={leaderboardDescending}
                    />
                {:else}
                    <SectionState state="empty" message={`${data.minGames}게임 이상 뛴 사람이 없어요`} />
                {/if}
            </section>

            <section aria-labelledby="champion-stats" class="flex flex-col gap-3">
                <h2 id="champion-stats" class="text-lg font-semibold">챔피언</h2>
                {#if data.champions.length}
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex (좁은 표의 가로 스크롤에 키보드 진입점을 제공한다.) -->
                    <div
                        role="region"
                        aria-labelledby="champion-stats-caption"
                        tabindex="0"
                        class="relative overflow-x-auto rounded-(--radius-box) border border-border bg-bg-surface dark:bg-bg-surface-dark"
                    >
                        <table
                            class="w-full min-w-80 text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap"
                        >
                            <caption id="champion-stats-caption" class="sr-only"
                                >챔피언별 픽·승률, 픽 많은 순</caption
                            >
                            <thead class="text-xs opacity-60">
                                <tr class="border-b border-border">
                                    <th scope="col" class="px-4 py-2 text-left font-medium">챔피언</th>
                                    <th scope="col" class="px-4 py-2 text-right font-medium">픽</th>
                                    <th scope="col" class="px-4 py-2 text-right font-medium">승률</th>
                                    <th scope="col" class="px-4 py-2 text-right font-medium">KDA</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each data.champions.slice((championPage - 1) * CHAMPION_PAGE, championPage * CHAMPION_PAGE) as record (record.champion.id)}
                                    <tr class="border-b border-border last:border-b-0">
                                        <th scope="row" class="px-4 py-2 text-left font-medium">
                                            <span class="flex items-center gap-3">
                                                {#if record.champion.iconUrl}<img
                                                        src={record.champion.iconUrl}
                                                        alt=""
                                                        class="size-8 rounded-(--radius-small)"
                                                    />{/if}
                                                {record.champion.name}
                                            </span>
                                        </th>
                                        <td class="px-4 py-2 text-right tabular-nums">{record.games}</td>
                                        <!-- 표본이 작으면 승률이 우연에 크게 흔들리므로 표시하지 않는다. -->
                                        <td class="px-4 py-2 text-right tabular-nums"
                                            >{record.games >= 5
                                                ? `${Math.round((record.wins / record.games) * 100)}%`
                                                : '-'}</td
                                        >
                                        <td class="px-4 py-2 text-right tabular-nums"
                                            >{fixed(record.kda, 2)}</td
                                        >
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <PageNav
                        total={data.champions.length}
                        pageSize={CHAMPION_PAGE}
                        current={championPage}
                        onchange={(current) => (championPage = current)}
                        label="챔피언 쪽 이동"
                    />
                {:else}
                    <SectionState state="empty" message="이 조건에는 챔피언 기록이 없어요" />
                {/if}
            </section>
        </div>
    {/if}
</div>

{#if !data.empty && data.achievements.length}
    <AchievementRankingDialog
        bind:open={rankingOpen}
        items={data.achievements}
        {guildId}
        bind:current={() => achievementIndex, selectAchievement}
    />
{/if}
