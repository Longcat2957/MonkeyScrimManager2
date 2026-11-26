<script lang="ts">
    import SiteShell from '#lib/components/layout/SiteShell.svelte';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<SiteShell {children} />
