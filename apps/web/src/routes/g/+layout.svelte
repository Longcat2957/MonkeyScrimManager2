<script lang="ts">
    import RailShell from '#lib/components/layout/RailShell.svelte';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<RailShell {children} />
