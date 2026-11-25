<script lang="ts">
    import AppShell from '../(app)/+layout.svelte';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<AppShell {children} />
