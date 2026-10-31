<script lang="ts">
	import { Grid, Grids } from 'stdf';
	import { formatShortDate, POSITIONS } from '#lib/features/labels.ts';
	import { formatMmr, LANES, winRate, type ChampionRef, type FormationPlayer, type TargetProfile } from '#lib/features/scrims/formation.ts';

	// 현재 후보의 상세 보기: 내전 전적, 주력 챔피언, 라인별 MMR, 선호 챔피언, 최근 게임, Riot 전적.
	let { player, profile }: { player: FormationPlayer; profile: TargetProfile } = $props();

	const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
	const recentWins = $derived(profile.recentGames.filter((game) => game.win).length);
</script>

{#snippet champ(champion: ChampionRef)}
	{#if champion.iconUrl}
		<img src={champion.iconUrl} alt="" loading="lazy" class="size-8 shrink-0 rounded-(--radius-small) object-cover" />
	{:else}
		<span aria-hidden="true" class="flex size-8 shrink-0 items-center justify-center rounded-(--radius-small) bg-bg-highlight text-xs dark:bg-bg-highlight-dark">
			{champion.name.slice(0, 1)}
		</span>
	{/if}
{/snippet}

{#snippet heading(title: string, aside?: string)}
	<div class="flex items-baseline justify-between gap-3">
		<h4 class="text-xs font-semibold opacity-70">{title}</h4>
		{#if aside}<span class="text-xs opacity-60">{aside}</span>{/if}
	</div>
{/snippet}

<div class="flex max-h-[28rem] flex-col gap-4 overflow-y-auto rounded-(--radius-form) bg-bg-highlight/40 p-3 dark:bg-bg-highlight-dark/40">
	<section class="flex flex-col gap-2">
		{@render heading('내전 전적', `${profile.summary.wins}승 ${profile.summary.losses}패`)}
		<Grids cols="3" gap="1" mx="0" my="0">
			{#each [['내전', `${profile.summary.games}게임`], ['승률', winRate(profile.summary.games, profile.summary.wins)], ['주력 포지션', laneText(profile.mainLane)]] as [label, value] (label)}
				<Grid>
					<div class="rounded-(--radius-small) bg-bg-surface p-2 dark:bg-bg-surface-dark">
						<p class="text-[0.6875rem] opacity-60">{label}</p>
						<p class="text-sm font-semibold">{value}</p>
					</div>
				</Grid>
			{/each}
		</Grids>
	</section>

	<section class="flex flex-col gap-2">
		{@render heading('내전 주력 챔피언')}
		<ul class="flex flex-col gap-1">
			{#each profile.championRecords as record (record.champion.id)}
				<li class="flex items-center gap-2 rounded-(--radius-small) bg-bg-surface p-2 dark:bg-bg-surface-dark">
					{@render champ(record.champion)}
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-sm font-semibold">{record.champion.name}</span>
						<span class="text-[0.6875rem] opacity-60">{record.games}게임 · {record.wins}승 {record.games - record.wins}패</span>
					</span>
					<span class="text-xs font-semibold tabular-nums">{winRate(record.games, record.wins)}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-2">
		{@render heading('라인별 MMR')}
		<ul class="grid grid-cols-5 gap-1 text-center">
			{#each LANES as lane (lane)}
				<li class="rounded-(--radius-small) bg-bg-surface p-1.5 dark:bg-bg-surface-dark">
					<p class="text-[0.6875rem] opacity-60">{laneText(lane)}</p>
					<p class="text-sm font-semibold tabular-nums">{formatMmr(player.mmr[lane])}</p>
					<p class="text-[0.6875rem] opacity-60 tabular-nums">{profile.laneGames[lane]}게임</p>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-2">
		{@render heading('선호 챔피언')}
		<ul class="grid grid-cols-3 gap-1">
			{#each profile.preferredChampions as champion (champion.id)}
				<li class="flex min-w-0 items-center gap-2 rounded-(--radius-small) bg-bg-surface p-2 dark:bg-bg-surface-dark">
					{@render champ(champion)}
					<span class="truncate text-xs font-semibold">{champion.name}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-2">
		{@render heading('최근 게임', `${recentWins}승 ${profile.recentGames.length - recentWins}패`)}
		<span aria-hidden="true" class="flex gap-0.5">
			{#each profile.recentGames as game (game.id)}
				<span class={['h-1.5 flex-1 rounded-full', game.win ? 'bg-success/80' : 'bg-error/70']}></span>
			{/each}
		</span>
		<ul class="flex flex-col gap-1">
			{#each profile.recentGames as game (game.id)}
				<li class="flex items-center gap-2 rounded-(--radius-small) bg-bg-surface p-2 dark:bg-bg-surface-dark">
					{@render champ(game.champion)}
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-xs font-semibold">{game.champion.name}</span>
						<span class="text-[0.6875rem] opacity-60">{laneText(game.lane)} · {formatShortDate(game.playedAt)}</span>
					</span>
					<span class={['text-xs font-semibold', game.win ? 'text-success' : 'text-error']}>{game.win ? '승' : '패'}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-2">
		{@render heading('Riot 전적')}
		{#if profile.riot}
			<Grids cols="3" gap="1" mx="0" my="0">
				{#each [['솔로 랭크', profile.riot.tier ?? '-'], ['최근', `${profile.riot.games}게임`], ['승률', winRate(profile.riot.games, profile.riot.wins)]] as [label, value] (label)}
					<Grid>
						<div class="rounded-(--radius-small) bg-bg-surface p-2 dark:bg-bg-surface-dark">
							<p class="text-[0.6875rem] opacity-60">{label}</p>
							<p class="truncate text-sm font-semibold">{value}</p>
						</div>
					</Grid>
				{/each}
			</Grids>
			<ul class="flex flex-wrap gap-1">
				{#each profile.riot.champions as champion (champion.id)}
					<li class="flex items-center gap-1.5 rounded-(--radius-small) bg-bg-surface py-1 pr-2 pl-1 text-xs dark:bg-bg-surface-dark">
						{@render champ(champion)}{champion.name}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="rounded-(--radius-small) bg-bg-surface px-3 py-2 text-sm opacity-60 dark:bg-bg-surface-dark">캐시된 Riot 전적이 없어요</p>
		{/if}
	</section>
</div>
