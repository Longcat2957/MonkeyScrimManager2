<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateTime } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import AsyncSection from '#lib/components/ui/AsyncSection.svelte';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { FORMATION_LABEL, SCRIM_STATUS } from '#lib/components/ui/status.ts';
	import ScrimRow from '#lib/components/scrim/ScrimRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const home = $derived(data.home);

	const scrimHref = (scrimId: string) =>
		resolve('/g/[guildId]/scrims/[scrimId]', { guildId: guild.id, scrimId });
</script>

<svelte:head>
	<title>{pageTitle(guild.name)}</title>
</svelte:head>

<h1 class="page-title">서버 홈</h1>

<!--
	서버 홈은 "지금 진행 중인 운영"만 담당한다.
	통계는 통계 화면, 전체 기록은 경기 기록 화면이 맡으므로 여기서 요약을 반복하지 않는다.
-->
<div class="mt-7 max-w-[56rem]">
	<div class="region">
		<span class="lbl" id="now">지금</span>
		<span class="count">{home.activeScrims.status === 'ready' ? `${home.activeScrims.data.length}건` : ''}</span>
	</div>

	<AsyncSection
		result={home.activeScrims}
		label="진행 중 내전"
		emptyText="지금 진행 중인 내전이 없습니다."
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
</div>
