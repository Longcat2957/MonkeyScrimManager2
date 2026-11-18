<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import ActivityBoard from '#lib/components/guild/ActivityBoard.svelte';
    import NextScrimHero from '#lib/components/guild/NextScrimHero.svelte';
    import RankingBoard from '#lib/components/guild/RankingBoard.svelte';
    import AchievementCarousel from '#lib/components/stats/AchievementCarousel.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const guildId = $derived(data.guild.id);
    const retry = () => invalidate('app:guild-home');
</script>

<svelte:head>
    <title>{data.guild.name} | {SERVICE_NAME}</title>
</svelte:head>

<h1 class="page-head text-title font-bold">{data.guild.name}</h1>

<!-- 위에서 아래로: 내 다음 내전 → 내전 현황 | 서버 순위 → 업적 -->
<div class="@container mt-4 flex flex-col gap-5">
    <NextScrimHero
        next={data.nextScrim}
        href={data.nextScrim &&
            resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: data.nextScrim.scrim.id })}
    />

    <div class="grid items-start gap-4 @min-[52rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ActivityBoard
            {guildId}
            activeScrims={data.activeScrims}
            recentMatches={data.recentMatches}
            heroShown={Boolean(data.nextScrim)}
            onretry={retry}
        />
        <RankingBoard
            {guildId}
            ranking={data.ranking}
            seasons={data.seasons}
            selectedSeasonId={data.selectedSeasonId}
            onretry={retry}
        />
    </div>

    {#if data.achievements.length}
        <section aria-labelledby="achievements" class="flex flex-col gap-3">
            <h2 id="achievements" class="text-base font-semibold">업적</h2>
            <AchievementCarousel items={data.achievements} />
        </section>
    {/if}
</div>
