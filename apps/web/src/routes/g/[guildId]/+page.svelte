<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import SectionState from '#lib/components/common/SectionState.svelte';
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

    <section aria-labelledby="achievements" class="panel overflow-hidden">
        <div class="panel-bar">
            <h2 id="achievements" class="text-base font-semibold">시즌 칭호</h2>
        </div>
        <div class="p-3">
            {#if !data.achievements.ok}
                <SectionState state="error" message="시즌 칭호를 불러오지 못했어요" onretry={retry} />
            {:else if data.achievements.value.length}
                {#key data.selectedSeasonId}
                    <AchievementCarousel items={data.achievements.value} />
                {/key}
            {:else}
                <SectionState state="empty" message="이 시즌에는 아직 칭호 보유자가 없어요" />
            {/if}
        </div>
    </section>
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
