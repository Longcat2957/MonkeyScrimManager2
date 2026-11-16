<script lang="ts">
    import { page } from '$app/state';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import { scrimNavItems } from '#lib/components/layout/navigation.ts';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();

    const navigation = $derived(scrimNavItems(data.guild.id, data.scrim, page.url.pathname));
</script>

<!-- 내전 제목·상태·메뉴는 모든 작업판에서 같은 위치에 둔다. -->
{#if data.scrim}
    <ScrimSummary scrim={data.scrim} {navigation} />
{/if}
{@render children()}
