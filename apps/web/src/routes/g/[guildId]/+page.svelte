<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateTime, formatNumber } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import AsyncSection from '#lib/components/ui/AsyncSection.svelte';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { FORMATION_LABEL, SCRIM_STATUS } from '#lib/components/ui/status.ts';
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

<h1 class="page-title">서버 홈</h1>

<div class="mt-7 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_18.25rem]">
	<div class="min-w-0 space-y-8">
		<section aria-labelledby="now">
			<div class="region">
				<span class="lbl" id="now">지금</span>
				<span class="count">{home.activeScrims.status === 'ready' ? `${home.activeScrims.data.length}건` : ''}</span>
			</div>

			<AsyncSection
				result={home.activeScrims}
				label="진행 중 내전"
				emptyText="진행 중인 내전이 없습니다."
				onretry={() => location.reload()}
			>
				{#snippet children(scrims)}
					{#if scrims.length > 0}
						{@const first = scrims[0]}
						{@const percent = Math.min(
							100,
							Math.round((first.selectedCount / Math.max(1, first.playingCapacity)) * 100)
						)}
						<article class="hero">
							<div class="hero-main">
								<StatusState status={SCRIM_STATUS[first.status]} />
								<h2 class="hero-title">{first.title}</h2>
								<p class="hero-meta">
									{formatDateTime(first.expectedStartAt)}
									<span aria-hidden="true"> · </span>
									{first.teamCount}팀 {first.playingCapacity}인
									<span aria-hidden="true"> · </span>
									{first.formationMethod ? FORMATION_LABEL[first.formationMethod] : '편성 방식 미정'}
								</p>
								{#if first.isHardFearless}
									<p class="hero-meta">하드 피어리스 적용</p>
								{/if}
							</div>
							<div class="hero-score">
								<div class="score"><b>{first.selectedCount}</b><span>/ {first.playingCapacity} 선발</span></div>
								<div class="meter"><i style:width={`${percent}%`}></i></div>
								<a class="btn btn--primary w-full" href={scrimHref(first.id)}>내전 열기</a>
							</div>
						</article>

						{#if scrims.length > 1}
							<div class="panel mt-2.5">
								{#each scrims.slice(1) as scrim (scrim.id)}
									<ScrimRow {scrim} href={scrimHref(scrim.id)} />
								{/each}
							</div>
						{/if}
					{/if}
				{/snippet}
			</AsyncSection>
		</section>

		<section aria-labelledby="recent">
			<div class="region">
				<span class="lbl" id="recent">최근 경기</span>
				<span class="count">{home.recentMatches.status === 'ready' ? `${home.recentMatches.data.length}건` : ''}</span>
			</div>

			<AsyncSection
				result={home.recentMatches}
				label="최근 경기"
				emptyText="아직 기록된 경기가 없습니다."
				onretry={() => location.reload()}
			>
				{#snippet children(matches)}
					{#if matches.length > 0}
						<div class="panel">
							{#each matches as match (match.id)}
								<MatchRow {match} href={matchHref(match.id)} />
							{/each}
						</div>
					{/if}
				{/snippet}
			</AsyncSection>
		</section>
	</div>

	<aside aria-labelledby="pulse" class="min-w-0">
		<div class="region">
			<span class="lbl" id="pulse">서버 현황</span>
		</div>

		<AsyncSection result={home.summary} label="서버 현황" emptyText="아직 집계된 기록이 없습니다.">
			{#snippet children(summary)}
				<div class="stats">
					<div class="stat"><span>완료 Game</span><b>{formatNumber(summary.completedGames)}<small>경기</small></b></div>
					<div class="stat"><span>참가 사용자</span><b>{formatNumber(summary.players)}<small>명</small></b></div>
					<div class="stat"><span>평균 경기 길이</span><b>{summary.averageDurationMs === null ? '—' : Math.round(summary.averageDurationMs / 60000)}<small>분</small></b></div>
				</div>
			{/snippet}
		</AsyncSection>
	</aside>
</div>
