<script lang="ts">
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import BracketBoard from '#lib/components/bracket/BracketBoard.svelte';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>{data.scrim.title} · 대진 | {SERVICE_NAME}</title>
</svelte:head>

<ScrimSummary scrim={data.scrim} />

<BracketBoard
    bracket={data.bracket}
    auction={data.scrim.formationMethod === 'auction'}
    guildId={page.params.guildId!}
    emptyMessage={data.scrim.status === 'cancelled' ? '내전이 취소되어 표시할 대진이 없어요.' : undefined}
/>
