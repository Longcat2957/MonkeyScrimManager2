<script lang="ts">
	import { Grid, Grids, Pagination, Stepper, Tab } from 'stdf';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import LeaderboardTable from '#lib/components/stats/LeaderboardTable.svelte';
	import type { LolPosition } from '#lib/features/guild/types.ts';
	import { POSITIONS } from '#lib/features/labels.ts';
	import { formatDuration } from '#lib/features/matches/format.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const CHAMPION_PAGE = 15;
	const FILTERS = [{ key: 'all' as const, text: '전체' }, ...POSITIONS.map((position) => ({ key: position.key, text: position.text }))];

	const guildId = $derived(page.params.guildId!);
	const changing = $derived(navigating.to?.route.id === page.route.id);
	let championPage = $state(1);
	let minGames = $state(5);
	$effect(() => {
		if (data.empty) return;
		minGames = data.minGames;
		void data.position;
		championPage = 1;
	});

	function navigate(params: { position?: LolPosition | 'all'; min?: number }) {
		const url = new URL(page.url.href);
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
	<h1 class="text-2xl font-semibold">통계</h1>

	{#if data.empty}
		<SectionState state="empty" message="아직 기록된 게임이 없어요" />
	{:else}
		{@const kpis = [
			['총 게임', String(data.kpis.games), '기록된 게임'],
			['참가자', String(data.kpis.players), '한 게임 이상 뛴 사람'],
			['평균 게임 시간', formatDuration(data.kpis.averageDurationSec), null],
			['분당 킬', data.kpis.killsPerMinute.toFixed(2), '게임 1분당 나온 킬'],
			['평균 KDA', data.kpis.kda.toFixed(2), '(킬+어시스트) / 데스'],
			['사용한 챔피언', String(data.kpis.champions), '이 서버에서 나온 챔피언']
		]}
		<section aria-labelledby="kpis">
			<h2 id="kpis" class="sr-only">핵심 지표</h2>
			<Grids cols={desktop.current ? '6' : '2'} gap="2" mx="0" my="0">
				{#each kpis as [label, value, note] (label)}
					<Grid>
						<div class="flex h-full flex-col gap-1 rounded-(--radius-box) border border-border bg-bg-surface p-4 dark:bg-bg-surface-dark">
							<p class="text-xs font-semibold opacity-60">{label}</p>
							<p class="text-3xl font-black tabular-nums">{value}</p>
							{#if note}<p class="text-xs opacity-60">{note}</p>{/if}
						</div>
					</Grid>
				{/each}
			</Grids>
		</section>

		<!-- 포지션 필터는 업적·리더보드·챔피언에 함께 적용한다. -->
		<div class="flex items-center gap-2">
			<div role="group" aria-label="포지션 필터" class="min-w-0 flex-1 border-b border-border">
				<Tab labels={FILTERS.map((filter) => ({ text: filter.text }))} active={FILTERS.findIndex((filter) => filter.key === data.position)} onclickTab={(index) => navigate({ position: FILTERS[index]!.key })} />
			</div>
		</div>

		<div class={['flex flex-col gap-8 transition-opacity', changing && 'opacity-50']}>
			{#if data.achievements.length}
				<section aria-labelledby="achievements" class="flex flex-col gap-3">
					<h2 id="achievements" class="text-lg font-semibold">업적</h2>
					<!-- 모바일에서는 가로로 넘기고, 넓은 화면에서는 격자로 모두 보여 준다. -->
					<ul class="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3 [&::-webkit-scrollbar]:hidden">
						{#each data.achievements as item (item.id)}
							<li class="w-[80%] shrink-0 snap-start sm:w-auto">
								<a
									href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: item.userId })}
									class="flex h-full items-center gap-4 rounded-(--radius-box) border border-warning/30 bg-bg-base-dark p-4 text-text-dark ring-1 ring-white/5 hover:border-warning/60"
								>
									<PlayerFace name={item.displayName} imageUrl={item.iconUrl} size="lg" />
									<span class="flex min-w-0 flex-col gap-0.5">
										<span class="text-lg font-black text-warning">{item.title}</span>
										<span class="truncate text-xs text-white/60">{item.description}</span>
										<span class="truncate font-semibold">{item.displayName}</span>
										<span class="text-sm text-white/80 tabular-nums">{item.value} · {item.games}게임</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section aria-labelledby="leaderboard" class="flex flex-col gap-3">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<h2 id="leaderboard" class="text-lg font-semibold">리더보드</h2>
					<div class="flex items-center gap-3 text-sm">
						<span id="min-games-label" class="opacity-70">최소 게임</span>
						<div role="group" aria-labelledby="min-games-label">
							<Stepper bind:value={minGames} min={1} max={50} onchange={(value) => navigate({ min: Number(value) })} />
						</div>
						<span class="opacity-60 tabular-nums">{data.leaderboard.length}명 / {data.playerCount}명</span>
					</div>
				</div>
				{#if data.leaderboard.length}
					<LeaderboardTable rows={data.leaderboard} {guildId} />
				{:else}
					<SectionState state="empty" message={`${data.minGames}게임 이상 뛴 사람이 없어요`} />
				{/if}
			</section>

			<section aria-labelledby="champion-stats" class="flex flex-col gap-3">
				<h2 id="champion-stats" class="text-lg font-semibold">챔피언</h2>
				<div class="overflow-hidden rounded-(--radius-box) border border-border bg-bg-surface dark:bg-bg-surface-dark">
					<table class="w-full text-sm">
						<caption class="sr-only">챔피언별 픽·승률, 픽 많은 순</caption>
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
											{#if record.champion.iconUrl}<img src={record.champion.iconUrl} alt="" class="size-8 rounded-(--radius-small)" />{/if}
											{record.champion.name}
										</span>
									</th>
									<td class="px-4 py-2 text-right tabular-nums">{record.games}</td>
									<!-- 표본이 작으면 승률이 우연에 크게 흔들리므로 표시하지 않는다. -->
									<td class="px-4 py-2 text-right tabular-nums">{record.games >= 5 ? `${Math.round((record.wins / record.games) * 100)}%` : '-'}</td>
									<td class="px-4 py-2 text-right tabular-nums">{record.kda.toFixed(2)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if data.champions.length > CHAMPION_PAGE}
					<nav aria-label="챔피언 쪽 이동" class="flex justify-center pt-2">
						<Pagination total={data.champions.length} pageSize={CHAMPION_PAGE} current={championPage} onchange={(current) => (championPage = current)} />
					</nav>
				{/if}
			</section>
		</div>
	{/if}
</div>
