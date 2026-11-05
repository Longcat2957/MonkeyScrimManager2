<script lang="ts">
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import BracketBoard from '#lib/components/bracket/BracketBoard.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>{data.scrim.title} · 결과 | {SERVICE_NAME}</title>
</svelte:head>

<BracketBoard bracket={data.bracket} guildId={page.params.guildId!} />
