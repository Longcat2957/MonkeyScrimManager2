<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import AccessibleAccordion from '#lib/components/common/AccessibleAccordion.svelte';
    import Button from '#lib/components/common/Button.svelte';
    import LinkCell from '#lib/components/common/LinkCell.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import SeasonSelector from '#lib/components/common/SeasonSelector.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import DuoList from '#lib/components/players/DuoList.svelte';
    import RadarChart from '#lib/components/players/RadarChart.svelte';
    import { percent, integer, withUnit } from '#lib/features/players/format.ts';
    import type { RankedMetric } from '#lib/features/players/stats.ts';
    import { formatShortDate, POSITIONS } from '#lib/features/labels.ts';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const guildId = $derived(page.params.guildId!);
    const changing = $derived(navigating.to?.route.id === page.route.id);
    const laneText = (key: LolPosition) => POSITIONS.find((position) => position.key === key)?.text ?? key;
    const filters = $derived([{ key: 'all' as const, games: data.overallGames }, ...data.positions]);
    const active = $derived(filters.findIndex((filter) => filter.key === data.position));
    const labels = $derived(
        filters.map((filter) => `${filter.key === 'all' ? '전체' : laneText(filter.key)} ${filter.games}`)
    );
    // 챔피언이 많으면 상위 몇 개만 먼저 보여 준다. 포지션을 바꾸면 다시 접는다.
    const CHAMPION_PREVIEW = 6;
    let showAllChampions = $state(false);
    $effect(() => {
        void data.position;
        void data.selectedSeasonId;
        showAllChampions = false;
    });
    const champions = $derived(showAllChampions ? data.champions : data.champions.slice(0, CHAMPION_PREVIEW));
    const gameHref = (matchId: string, gameId: string) =>
        `${resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId })}?game=${gameId}`;

    const top = (key: RankedMetric) => (data.percents?.[key] != null ? `상위 ${data.percents[key]}%` : null);
    const PRIMARY_METRICS = new Set([
        'winRate',
        'kda',
        'killParticipation',
        'csPerMin',
        'damagePerMin',
        'visionPerGame'
    ]);
    const tiles = $derived.by((): [RankedMetric | 'lossStreak', string, string, string | null][] => {
        const s = data.summary;
        if (!s) return [];
        return [
            ['winRate', '승률', percent(s.wins / s.games), top('winRate')],
            ['kda', 'KDA', integer(s.kda), top('kda')],
            ['killParticipation', '킬 관여', percent(s.killParticipation), top('killParticipation')],
            ['winStreak', '최장 연승', withUnit(s.winStreak, '연승'), top('winStreak')],
            ['lossStreak', '최장 연패', withUnit(s.lossStreak, '연패'), null],
            ['kills', '평균 킬', integer(s.kills), top('kills')],
            ['deaths', '평균 데스', integer(s.deaths), top('deaths')],
            ['assists', '평균 어시스트', integer(s.assists), top('assists')],
            ['maxKills', '최다 킬', withUnit(s.maxKills, '킬'), top('maxKills')],
            ['champions', '챔피언 폭', withUnit(s.champions, '개'), top('champions')],
            ['csPerMin', '분당 CS', integer(s.csPerMin), top('csPerMin')],
            ['goldPerMin', '분당 골드', integer(s.goldPerMin), top('goldPerMin')],
            ['damagePerMin', '분당 피해량', integer(s.damagePerMin), top('damagePerMin')],
            ['damageTakenPerMin', '분당 받은 피해', integer(s.damageTakenPerMin), top('damageTakenPerMin')],
            ['visionPerGame', '게임당 시야', integer(s.visionPerGame), top('visionPerGame')]
        ];
    });
    const primaryTiles = $derived(tiles.filter(([key]) => PRIMARY_METRICS.has(key)));
    const secondaryTiles = $derived(tiles.filter(([key]) => !PRIMARY_METRICS.has(key)));
    // 같은 세트가 여러 기록에 나타나도 이동 조작은 처음 등장한 행 하나에만 둔다.
    const historyRows = $derived.by(() => {
        const visited = new Set<string>();
        return data.history.map((game) => {
            const destination = gameHref(game.matchId, game.gameId);
            const href = visited.has(destination) ? null : destination;
            visited.add(destination);
            return { game, href };
        });
    });
    // 성향 그래프는 상위 %를 0~1 점수로 바꿔 그린다. 바깥쪽일수록 서버에서 앞선다.
    const RADAR_AXES = [
        ['전투', 'kda'],
        ['성장', 'goldPerMin'],
        ['시야', 'visionPerGame'],
        ['생존', 'deaths'],
        ['챔프 폭', 'champions'],
        ['킬 관여', 'killParticipation']
    ] as const;
    const radar = $derived.by(() => {
        const percents = data.percents;
        return percents && RADAR_AXES.every(([, key]) => percents[key] !== null)
            ? RADAR_AXES.map(([label, key]) => ({
                  label,
                  value: (101 - percents[key]!) / 100,
                  detail: `상위 ${percents[key]}%`
              }))
            : null;
    });
    const overall = $derived(data.overallGames);

    function navigate(params: { position?: LolPosition | 'all'; page?: number }) {
        const url = new URL(page.url.href);
        if (params.position !== undefined) {
            url.searchParams.delete('page');
            if (params.position === 'all') url.searchParams.delete('position');
            else url.searchParams.set('position', params.position);
        }
        if (params.page !== undefined) {
            if (params.page === 1) url.searchParams.delete('page');
            else url.searchParams.set('page', String(params.page));
        }
        goto(url, { reset: false });
    }
</script>

<svelte:head>
    <title>{data.player.displayName} 전적 | {SERVICE_NAME}</title>
</svelte:head>

<div class="@container min-w-0" aria-busy={changing}>
    <div class="grid min-w-0 items-start gap-6 @min-[57rem]:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)]">
        <header
            class="grid min-w-0 gap-4 border-b border-line pb-5 @min-[39rem]:grid-cols-2 @min-[57rem]:grid-cols-1 @min-[57rem]:border-r @min-[57rem]:border-b-0 @min-[57rem]:pr-5"
        >
            <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div
                    class="flex min-w-0 max-w-full items-start gap-3 @min-[57rem]:flex-col @min-[57rem]:[&>img]:size-20 @min-[57rem]:[&>span]:size-20"
                >
                    <PlayerFace name={data.player.displayName} imageUrl={data.player.iconUrl} size="lg" />
                    <div class="flex min-w-0 flex-col gap-1">
                        <div class="flex min-w-0 flex-col items-start gap-2">
                            <h1 class="min-w-0 max-w-full text-title font-bold wrap-anywhere">
                                {data.player.displayName}
                            </h1>
                            {#if data.badges.length}
                                <ul aria-label="시즌 칭호" class="flex flex-wrap gap-1">
                                    {#each data.badges as badge (badge.id)}
                                        <li
                                            class="rounded-(--radius-small) bg-surface-2 px-2 py-0.5 text-xs font-semibold text-role-gold"
                                        >
                                            {badge.title}{badge.tied ? ' (공동 1위)' : ''}
                                        </li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>
                        {#if data.player.riotIds.length}
                            <p class="text-ui wrap-anywhere text-muted">{data.player.riotIds.join(' · ')}</p>
                        {/if}
                    </div>
                </div>
                <SeasonSelector seasons={data.seasons} selectedSeasonId={data.selectedSeasonId} />
            </div>
            {#if data.recordWins !== null}
                <div
                    class="flex flex-wrap items-baseline gap-x-2 border-t border-line pt-3 font-semibold tabular-nums @min-[39rem]:border-t-0 @min-[57rem]:border-t"
                >
                    <span class="text-2xl text-success">{data.recordWins}승</span>
                    <span class="text-2xl text-error">{overall - data.recordWins}패</span>
                    <span class="text-ui text-muted">{overall}게임</span>
                </div>
            {/if}
            {#if data.recent.length}
                <section aria-labelledby="recent-strip" class="flex flex-col items-start gap-2">
                    <h2 id="recent-strip" class="text-xs font-semibold text-muted">
                        최근 {data.recent.length}게임
                    </h2>
                    <ol class="flex min-w-0 flex-wrap gap-1 @min-[57rem]:grid @min-[57rem]:grid-cols-5">
                        {#each data.recent as game, index (index)}
                            <li>
                                <span
                                    class={[
                                        'flex min-w-7 flex-col items-center gap-0.5',
                                        game.win ? 'text-success' : 'text-error'
                                    ]}
                                    title={`${game.champion.name} ${game.win ? '승' : '패'}`}
                                >
                                    {#if game.champion.iconUrl}
                                        <img
                                            src={game.champion.iconUrl}
                                            alt=""
                                            class="size-7 rounded-(--radius-small) @min-[57rem]:size-9"
                                        />
                                    {:else}
                                        <span
                                            class="flex size-7 items-center justify-center bg-surface-2 text-xs @min-[57rem]:size-9"
                                            >{game.champion.name.slice(0, 2)}</span
                                        >
                                    {/if}
                                    <span aria-hidden="true" class="text-micro font-semibold"
                                        >{game.win ? '승' : '패'}</span
                                    >
                                    <span class="sr-only"
                                        >{game.champion.name} {game.win ? '승리' : '패배'}</span
                                    >
                                </span>
                            </li>
                        {/each}
                    </ol>
                </section>
            {/if}
            {#if data.summary || data.position !== 'all'}
                <section aria-labelledby="mmr" class="min-w-0 border-t border-line pt-3">
                    <h2 id="mmr" class="mb-2 text-ui font-semibold">포지션별 MMR</h2>
                    {#if data.mmr.length}
                        <dl class="flex flex-wrap gap-x-5 gap-y-2 @min-[57rem]:grid @min-[57rem]:gap-0">
                            {#each data.mmr as row (row.position)}
                                <div
                                    class="flex flex-wrap items-baseline gap-x-2 py-1 @min-[57rem]:border-b @min-[57rem]:border-line @min-[57rem]:py-2"
                                >
                                    <dt class="mr-auto flex items-center gap-1.5 text-ui">
                                        <PositionIcon position={row.position} size="sm" />{laneText(
                                            row.position
                                        )}
                                    </dt>
                                    <dd class="flex flex-wrap items-baseline gap-x-2 text-ui tabular-nums">
                                        <strong class={row.position === data.position ? 'text-nexus' : ''}
                                            >{integer(row.rating)}<span class="sr-only"> MMR</span></strong
                                        >
                                        <span class="text-xs text-muted">{row.games}게임</span>
                                    </dd>
                                </div>
                            {/each}
                        </dl>
                    {:else}
                        <p class="text-ui text-muted">아직 반영된 MMR이 없어요</p>
                    {/if}
                </section>
            {/if}
        </header>

        <div class="@container/record flex min-w-0 flex-col gap-4">
            {#if !data.summary && data.position === 'all'}
                <SectionState
                    state="empty"
                    message={data.selectedSeasonId
                        ? '이 시즌에는 기록된 게임이 없어요'
                        : '아직 기록된 게임이 없어요'}
                />
            {:else}
                <!-- 포지션 필터는 요약·챔피언·최근 게임에 함께 적용한다. -->
                <div
                    role="group"
                    aria-label="포지션 필터"
                    class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3"
                >
                    <span class="text-ui font-semibold">포지션</span>
                    <SelectionTabs
                        {labels}
                        {active}
                        onchange={(index) => navigate({ position: filters[index]!.key })}
                    />
                </div>
                {#if changing}<p role="status" class="text-sm text-muted">전적을 불러오는 중</p>{/if}

                <!-- 먼저 지표와 포지션별 실력을 확인하고, 챔피언·개별 기록과 보조 분석을 이어 읽는다. -->
                <div class="grid min-w-0 items-start gap-5">
                    <div
                        class={[
                            'grid min-w-0 items-start gap-5',
                            radar && '@min-[40rem]/record:grid-cols-[minmax(0,1fr)_17rem]'
                        ]}
                    >
                        <section aria-labelledby="summary" class="min-w-0">
                            <h2 id="summary" class="mb-3 text-base font-semibold">핵심 지표</h2>
                            <dl class="grid grid-cols-3 gap-x-3 gap-y-4">
                                {#each primaryTiles as [key, label, value, note], index (key)}
                                    <div
                                        class={['min-w-0', index < 3 ? 'border-b border-line pb-3' : 'pb-1']}
                                    >
                                        <dt class="text-xs font-medium text-muted">{label}</dt>
                                        <dd class="mt-0.5">
                                            <strong
                                                class={[
                                                    'font-brand tabular-nums',
                                                    index < 3 ? 'text-2xl' : 'text-lg'
                                                ]}>{value}</strong
                                            >
                                            {#if note}<span class="block text-xs text-muted">{note}</span
                                                >{/if}
                                        </dd>
                                    </div>
                                {/each}
                            </dl>
                            <div class="mt-3 border-y border-line">
                                <AccessibleAccordion
                                    items={[{ title: `세부 지표 ${secondaryTiles.length}개` }]}
                                >
                                    {#snippet children()}
                                        <dl class="grid gap-x-5 pb-3 @min-[35rem]:grid-cols-2">
                                            {#each secondaryTiles as [key, label, value, note] (key)}
                                                <div
                                                    class="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-2"
                                                >
                                                    <dt class="text-ui text-ink-2">{label}</dt>
                                                    <dd class="text-ui font-semibold tabular-nums">
                                                        {value}
                                                        {#if note}<span class="text-xs font-normal text-muted"
                                                                >{note}</span
                                                            >{/if}
                                                    </dd>
                                                </div>
                                            {/each}
                                        </dl>
                                    {/snippet}
                                </AccessibleAccordion>
                            </div>
                        </section>
                        {#if radar}
                            <section
                                aria-labelledby="style"
                                class="min-w-0 border-t border-line pt-3 @min-[40rem]/record:border-t-0 @min-[40rem]/record:border-l @min-[40rem]/record:pt-0 @min-[40rem]/record:pl-4"
                            >
                                <h2 id="style" class="text-base font-semibold">플레이 성향</h2>
                                <RadarChart title="서버 내 상위 % 기준 플레이 성향" axes={radar} />
                            </section>
                        {/if}
                    </div>

                    <div
                        class="grid min-w-0 items-start gap-5 @min-[43rem]/record:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
                    >
                        <section aria-labelledby="history" class="panel overflow-hidden">
                            <div class="panel-bar">
                                <h2 id="history" class="text-base font-semibold">게임 기록</h2>
                            </div>
                            <ul class="divide-y divide-line">
                                {#each historyRows as { game, href } (game.gameId + game.playedAt)}
                                    <li>
                                        <LinkCell
                                            {href}
                                            line={false}
                                            subTitle={`${game.scrimTitle} · ${game.playedAt ? formatShortDate(game.playedAt) : '경기 일시 미확인'}`}
                                        >
                                            {#snippet leftChild()}
                                                <span class="relative block size-8 shrink-0">
                                                    {#if game.champion.iconUrl}<img
                                                            src={game.champion.iconUrl}
                                                            alt=""
                                                            class="size-8 rounded-(--radius-small)"
                                                        />{/if}
                                                    {#if game.position}<span
                                                            class="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5"
                                                            ><PositionIcon
                                                                position={game.position}
                                                                size="sm"
                                                            /></span
                                                        >{/if}
                                                </span>
                                            {/snippet}
                                            {#snippet titleChild()}
                                                <span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                                    <span class="min-w-0">{game.champion.name}</span>
                                                    <span class="text-xs font-normal text-ink-2 tabular-nums"
                                                        >{game.kills ?? '—'} /
                                                        <span class="text-error">{game.deaths ?? '—'}</span>
                                                        / {game.assists ?? '—'} · CS {game.cs ?? '—'}</span
                                                    >
                                                </span>
                                            {/snippet}
                                            {#snippet detailChild()}
                                                <StatusTag
                                                    text={game.win ? '승' : '패'}
                                                    state={game.win ? 'success' : 'error'}
                                                />
                                            {/snippet}
                                        </LinkCell>
                                    </li>
                                {:else}
                                    <li>
                                        <SectionState
                                            state="empty"
                                            message="이 쪽에는 게임 기록이 없어요. 아래 쪽 번호에서 다른 기록을 확인해 주세요."
                                        />
                                    </li>
                                {/each}
                            </ul>
                            <PageNav
                                total={data.total}
                                pageSize={data.pageSize}
                                current={data.page}
                                onchange={(current) => navigate({ page: current })}
                            />
                        </section>
                        <section aria-labelledby="champions" class="panel overflow-hidden">
                            <div class="panel-bar">
                                <h2 id="champions" class="text-base font-semibold">챔피언별 성적</h2>
                            </div>
                            <table class="data-table [&_td]:px-2">
                                <caption class="sr-only">챔피언별 출전 게임과 성적</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">챔피언</th>
                                        <th scope="col" class="text-right">게임</th>
                                        <th scope="col" class="text-right">승률</th>
                                        <th scope="col" class="text-right">KDA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each champions as record, index (record.champion.id)}
                                        <tr>
                                            <th scope="row" class="text-left font-semibold">
                                                <span
                                                    class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                                                >
                                                    {#if record.champion.iconUrl}<img
                                                            src={record.champion.iconUrl}
                                                            alt=""
                                                            class="size-7 shrink-0 rounded-(--radius-small)"
                                                        />{/if}
                                                    <span class="min-w-0 wrap-anywhere"
                                                        >{record.champion.name}</span
                                                    >
                                                    {#if index < 5}<span
                                                            class="text-micro whitespace-nowrap text-muted"
                                                            >{index + 1}위</span
                                                        >{/if}
                                                </span>
                                            </th>
                                            <td class="text-right tabular-nums">{record.games}</td>
                                            <td class="text-right font-semibold tabular-nums"
                                                >{percent(record.wins / record.games)}</td
                                            >
                                            <td class="text-right text-ink-2 tabular-nums"
                                                >{integer(record.kda)}</td
                                            >
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                            {#if data.champions.length > CHAMPION_PREVIEW}
                                <div class="flex justify-center border-t border-line p-1">
                                    <Button
                                        variant="quiet"
                                        class="min-h-11 px-3 text-sm"
                                        onclick={() => (showAllChampions = !showAllChampions)}
                                    >
                                        {showAllChampions
                                            ? '접기'
                                            : `챔피언 ${data.champions.length}개 모두 보기`}
                                    </Button>
                                </div>
                            {/if}
                        </section>
                    </div>

                    <aside
                        class="grid min-w-0 items-start divide-y divide-line border-y border-line @min-[32rem]/record:grid-cols-2 @min-[32rem]/record:divide-x @min-[32rem]/record:divide-y-0"
                    >
                        <DuoList
                            title="베스트 듀오"
                            records={data.duos.best}
                            {guildId}
                            seasonId={data.selectedSeasonId}
                            tone="success"
                        />
                        <DuoList
                            title="워스트 듀오"
                            records={data.duos.worst}
                            {guildId}
                            seasonId={data.selectedSeasonId}
                            tone="error"
                        />
                    </aside>
                </div>
            {/if}
        </div>
    </div>
</div>
