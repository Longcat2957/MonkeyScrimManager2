<script lang="ts">
	import { Button, CellGroup, Grid, Grids, Pagination, Tab } from 'stdf';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import LinkCell from '#lib/components/common/LinkCell.svelte';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import PositionIcon from '#lib/components/common/PositionIcon.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import DuoList from '#lib/components/players/DuoList.svelte';
	import { formatShortDate, POSITIONS } from '#lib/features/labels.ts';
	import type { LolPosition } from '#lib/features/guild/types.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guildId = $derived(page.params.guildId!);
	const laneText = (key: LolPosition) => POSITIONS.find((position) => position.key === key)?.text ?? key;
	const filters = $derived([{ key: 'all' as const, games: data.positions.reduce((sum, item) => sum + item.games, 0) }, ...data.positions]);
	const active = $derived(filters.findIndex((filter) => filter.key === data.position));
	const labels = $derived(filters.map((filter) => ({ text: `${filter.key === 'all' ? '전체' : laneText(filter.key)} ${filter.games}` })));
	// 챔피언이 많으면 상위 몇 개만 먼저 보여 준다. 포지션을 바꾸면 다시 접는다.
	const CHAMPION_PREVIEW = 6;
	let showAllChampions = $state(false);
	$effect(() => {
		void data.position;
		showAllChampions = false;
	});
	const champions = $derived(showAllChampions ? data.champions : data.champions.slice(0, CHAMPION_PREVIEW));
	const percent = (value: number) => `${Math.round(value * 100)}%`;
	const gameHref = (matchId: string, gameId: string) => `${resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId })}?game=${gameId}`;

	const tiles = $derived(
		data.summary
			? [
					['게임', `${data.summary.games}`, `${data.summary.wins}승 ${data.summary.games - data.summary.wins}패`],
					['승률', percent(data.summary.wins / data.summary.games), null],
					['KDA', data.summary.kda.toFixed(2), `${data.summary.kills.toFixed(1)} / ${data.summary.deaths.toFixed(1)} / ${data.summary.assists.toFixed(1)}`],
					['킬 관여', percent(data.summary.killParticipation), null],
					['분당 CS', data.summary.csPerMin.toFixed(1), null],
					['분당 피해량', Math.round(data.summary.damagePerMin).toLocaleString('ko-KR'), null],
					['게임당 시야', data.summary.visionPerGame.toFixed(1), null],
					['주 포지션', data.summary.mainPosition ? laneText(data.summary.mainPosition) : '-', null]
				]
			: []
	);

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

<div class="flex flex-col gap-8">
	<header class="flex flex-col gap-5">
		<div class="flex items-center gap-4">
			<PlayerFace name={data.player.displayName} imageUrl={data.player.iconUrl} size="lg" />
			<div class="flex min-w-0 flex-col gap-1">
				<h1 class="truncate text-2xl font-semibold">{data.player.displayName}</h1>
				{#if data.player.riotIds.length}
					<p class="truncate text-sm opacity-60">{data.player.riotIds.join(' · ')}</p>
				{/if}
			</div>
		</div>
		{#if data.recent.length}
			<section aria-labelledby="recent-strip" class="flex flex-col gap-2">
				<h2 id="recent-strip" class="text-xs font-semibold opacity-60">최근 {data.recent.length}게임</h2>
				<ol class="flex flex-wrap gap-1.5">
					{#each data.recent as game, index (index)}
						<li>
							<a href={gameHref(game.matchId, game.gameId)} class={['block rounded-(--radius-form) ring-2', game.win ? 'ring-success' : 'ring-error']} title={`${game.champion.name} ${game.win ? '승' : '패'}`}>
								{#if game.champion.iconUrl}
									<img src={game.champion.iconUrl} alt="" class="size-10 rounded-(--radius-form)" />
								{:else}
									<span class="flex size-10 items-center justify-center text-xs">{game.champion.name.slice(0, 2)}</span>
								{/if}
								<span class="sr-only">{game.champion.name} {game.win ? '승리' : '패배'}</span>
							</a>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</header>

	{#if !data.summary && data.position === 'all'}
		<SectionState state="empty" message="아직 기록된 게임이 없어요" />
	{:else}
		<!-- STDF Tab은 탭 역할을 알리지 않으므로 묶음 이름을 붙인다. 포지션 필터는 요약·챔피언·최근 게임에 함께 적용한다. -->
		<div role="group" aria-label="포지션 필터" class="border-b border-border">
			<Tab {labels} {active} onclickTab={(index) => navigate({ position: filters[index]!.key })} />
		</div>

		<div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<div class="flex min-w-0 flex-col gap-8">
				<section aria-labelledby="summary" class="flex flex-col gap-3">
					<h2 id="summary" class="text-lg font-semibold">핵심 지표</h2>
					<Grids cols={desktop.current ? '4' : '2'} gap="2" mx="0" my="0">
						{#each tiles as [label, value, note] (label)}
							<Grid>
								<div class="flex h-full flex-col gap-1 rounded-(--radius-box) border border-border bg-bg-surface p-4 dark:bg-bg-surface-dark">
									<p class="text-xs opacity-60">{label}</p>
									<p class="text-2xl font-bold tabular-nums">{value}</p>
									{#if note}<p class="text-xs opacity-60 tabular-nums">{note}</p>{/if}
								</div>
							</Grid>
						{/each}
					</Grids>
				</section>

				<section aria-labelledby="champions" class="flex flex-col gap-3">
					<h2 id="champions" class="text-lg font-semibold">챔피언별 성적</h2>
					<ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{#each champions as record, index (record.champion.id)}
							<li class="flex items-center gap-3 rounded-(--radius-box) border border-border bg-bg-surface p-3 dark:bg-bg-surface-dark">
								<span class="relative shrink-0">
									{#if record.champion.iconUrl}<img src={record.champion.iconUrl} alt="" class="size-11 rounded-(--radius-form)" />{/if}
									{#if index < 5}<span class="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-[0.625rem] font-bold text-white">{index + 1}</span>{/if}
								</span>
								<span class="flex min-w-0 flex-col">
									<span class="truncate font-semibold">{record.champion.name}</span>
									<span class="text-xs tabular-nums">
										<span class="opacity-60">{record.games}게임</span>
										<span class={record.wins / record.games >= 0.5 ? 'text-success' : 'text-error'}>{percent(record.wins / record.games)}</span>
										<span class="opacity-60">· KDA {record.kda.toFixed(2)}</span>
									</span>
								</span>
							</li>
						{/each}
					</ul>
					{#if data.champions.length > CHAMPION_PREVIEW}
						<span class="self-center">
							<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-3 text-sm" onclick={() => (showAllChampions = !showAllChampions)}>
								{showAllChampions ? '접기' : `챔피언 ${data.champions.length}개 모두 보기`}
							</Button>
						</span>
					{/if}
				</section>

				<section aria-labelledby="history" class="flex flex-col gap-3">
					<h2 id="history" class="text-lg font-semibold">최근 게임</h2>
					<CellGroup my="0" mx="0" shadow="none">
						<ul>
							{#each data.history as game, index (game.gameId + game.playedAt)}
								<li>
									<LinkCell href={gameHref(game.matchId, game.gameId)} line={index < data.history.length - 1} subTitle={`${game.scrimTitle} · ${formatShortDate(game.playedAt)}`}>
										{#snippet leftChild()}
											<span class="relative">
												{#if game.champion.iconUrl}<img src={game.champion.iconUrl} alt="" class="size-10 rounded-(--radius-form)" />{/if}
												<span class="absolute -right-1 -bottom-1 rounded-full bg-bg-surface p-0.5 dark:bg-bg-surface-dark"><PositionIcon position={game.position} size="sm" /></span>
											</span>
										{/snippet}
										{#snippet titleChild()}
											<span class="flex min-w-0 items-baseline gap-2">
												<span class="truncate">{game.champion.name}</span>
												<span class="shrink-0 text-sm font-normal tabular-nums">{game.kills} / <span class="text-error">{game.deaths}</span> / {game.assists} · CS {game.cs}</span>
											</span>
										{/snippet}
										{#snippet detailChild()}
											<StatusTag text={game.win ? '승' : '패'} state={game.win ? 'success' : 'error'} />
										{/snippet}
									</LinkCell>
								</li>
							{/each}
						</ul>
					</CellGroup>
					{#if data.total > data.pageSize}
						<nav aria-label="쪽 이동" class="flex justify-center pt-2">
							<Pagination total={data.total} pageSize={data.pageSize} current={data.page} onchange={(current) => navigate({ page: current })} />
						</nav>
					{/if}
				</section>
			</div>

			<aside class="flex flex-col gap-8">
				<section aria-labelledby="mmr" class="flex flex-col gap-3">
					<h2 id="mmr" class="text-lg font-semibold">포지션별 MMR</h2>
					<table class="w-full overflow-hidden rounded-(--radius-box) border border-border bg-bg-surface text-sm dark:bg-bg-surface-dark">
						<caption class="sr-only">포지션별 MMR</caption>
						<thead class="text-xs opacity-60">
							<tr class="border-b border-border">
								<th scope="col" class="px-3 py-2 text-left font-medium">포지션</th>
								<th scope="col" class="px-3 py-2 text-right font-medium">MMR</th>
								<th scope="col" class="px-3 py-2 text-right font-medium">게임</th>
							</tr>
						</thead>
						<tbody>
							{#each data.mmr as row (row.position)}
								<tr class="border-b border-border last:border-b-0">
									<th scope="row" class="px-3 py-2 text-left font-medium"><span class="flex items-center gap-2"><PositionIcon position={row.position} size="sm" />{laneText(row.position)}</span></th>
									<td class="px-3 py-2 text-right font-semibold tabular-nums">{row.rating.toLocaleString('ko-KR')}</td>
									<td class="px-3 py-2 text-right tabular-nums opacity-70">{row.games}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
				<DuoList title="베스트 듀오" records={data.duos.best} {guildId} tone="success" />
				<DuoList title="워스트 듀오" records={data.duos.worst} {guildId} tone="error" />
			</aside>
		</div>
	{/if}
</div>
