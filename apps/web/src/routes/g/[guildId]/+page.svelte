<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import ActivityBoard from '#lib/components/guild/ActivityBoard.svelte';
    import NextScrimBrief from '#lib/components/guild/NextScrimBrief.svelte';
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

<h1 class="page-head text-title font-bold wrap-anywhere">{data.guild.name}</h1>

<div class="@container mt-4 grid min-w-0 gap-8">
    <NextScrimBrief
        next={data.nextScrim}
        href={data.nextScrim &&
            resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: data.nextScrim.scrim.id })}
    />

    {#if data.achievements.length}
        <section aria-labelledby="achievements" class="min-w-0 border-t border-line">
            <h2 id="achievements" class="py-3 text-base font-semibold">업적</h2>
            <AchievementCarousel items={data.achievements} />
        </section>
    {/if}
    <div class="grid min-w-0 items-start gap-6 @min-[50rem]:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
        <RankingBoard
            {guildId}
            ranking={data.ranking}
            seasons={data.seasons}
            selectedSeasonId={data.selectedSeasonId}
            onretry={retry}
        />
        <ActivityBoard
            {guildId}
            activeScrims={data.activeScrims}
            recentMatches={data.recentMatches}
            nextShown={Boolean(data.nextScrim)}
            onretry={retry}
        />
    </div>
</div>
