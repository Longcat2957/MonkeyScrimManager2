<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDuration, formatNumber } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import AsyncSection from '#lib/components/ui/AsyncSection.svelte';
	import MetricList from '#lib/components/ui/MetricList.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import MatchRow from '#lib/components/records/MatchRow.svelte';
	import ScrimRow from '#lib/components/scrim/ScrimRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const home = $derived(data.home);

	const scrimHref = (scrimId: string) =>
		resolve('/g/[guildId]/scrims/[scrimId]', { guildId: guild.id, scrimId });
	const matchHref = (matchId: string) =>
		resolve('/g/[guildId]/matches/[matchId]', { guildId: guild.id, matchId });
</script>

<svelte:head>
	<title>{pageTitle(guild.name)}</title>
</svelte:head>

<PageHeader title="서버 홈" />

<div class="grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
	<div class="min-w-0 space-y-10">
		<section aria-labelledby="now">
			<h2 id="now" class="text-title-l">지금</h2>
			<div class="mt-3">
				<AsyncSection
					result={home.activeScrims}
					label="진행 중 내전"
					emptyText="진행 중인 내전이 없습니다."
					onretry={() => location.reload()}
				>
					{#snippet children(scrims)}
						<ul>
							{#each scrims as scrim, index (scrim.id)}
								<ScrimRow {scrim} href={scrimHref(scrim.id)} promoted={index === 0} />
							{/each}
						</ul>
					{/snippet}
				</AsyncSection>
			</div>
		</section>

		<section aria-labelledby="recent">
			<h2 id="recent" class="text-title-l">최근 경기</h2>
			<div class="mt-3">
				<AsyncSection
					result={home.recentMatches}
					label="최근 경기"
					emptyText="아직 기록된 경기가 없습니다."
					onretry={() => location.reload()}
				>
					{#snippet children(matches)}
						<ul>
							{#each matches as match (match.id)}
								<MatchRow {match} href={matchHref(match.id)} />
							{/each}
						</ul>
					{/snippet}
				</AsyncSection>
			</div>
		</section>
	</div>

	<aside aria-labelledby="pulse" class="min-w-0">
		<h2 id="pulse" class="text-title-l">서버 현황</h2>
		<div class="mt-3">
			<AsyncSection result={home.summary} label="서버 현황" emptyText="아직 집계된 기록이 없습니다.">
				{#snippet children(summary)}
					<MetricList
						columns="grid-2"
						items={[
							{ label: '완료 Game', value: formatNumber(summary.completedGames), unit: '경기' },
							{ label: '참가 사용자', value: formatNumber(summary.players), unit: '명' },
							{ label: '평균 경기 길이', value: formatDuration(summary.averageDurationMs) }
						]}
					/>
				{/snippet}
			</AsyncSection>
		</div>
	</aside>
</div>
