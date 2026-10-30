<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import ActivityBoard from '#lib/components/guild/ActivityBoard.svelte';
	import NextScrimHero from '#lib/components/guild/NextScrimHero.svelte';
	import RankingBoard from '#lib/components/guild/RankingBoard.svelte';
	import StoryCarousel from '#lib/components/guild/StoryCarousel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guildId = $derived(data.guild.id);
	const retry = () => invalidate('app:guild-home');
</script>

<svelte:head>
	<title>{data.guild.name} | {SERVICE_NAME}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">{data.guild.name}</h1>

<!-- 위에서 아래로: 내 다음 내전 → 이번 주 이야기(전체 폭) → 내전 현황 | 서버 순위 -->
<div class="mt-6 flex flex-col gap-10">
	<NextScrimHero
		next={data.nextScrim}
		href={data.nextScrim && resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: data.nextScrim.scrim.id })}
	/>

	{#if data.stories.length}
		<StoryCarousel {guildId} stories={data.stories} />
	{/if}

	<div class="grid items-start gap-10 lg:grid-cols-2 lg:gap-8">
		<ActivityBoard
			{guildId}
			activeScrims={data.activeScrims}
			recentMatches={data.recentMatches}
			heroShown={Boolean(data.nextScrim)}
			onretry={retry}
		/>
		<RankingBoard {guildId} ranking={data.ranking} onretry={retry} />
	</div>
</div>
