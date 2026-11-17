<script lang="ts">
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import BracketBoard from '#lib/components/bracket/BracketBoard.svelte';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>{data.scrim.title} · 결과 | {SERVICE_NAME}</title>
</svelte:head>

<ScrimSummary scrim={data.scrim} />

<BracketBoard
    bracket={data.bracket}
    guildId={page.params.guildId!}
    title={data.scrim.status === 'ended_early' ? '중도 종료 결과' : '대진 결과'}
    emptyMessage={data.scrim.status === 'ended_early'
        ? '대진을 만들기 전에 내전이 중도 종료됐어요.'
        : undefined}
/>
