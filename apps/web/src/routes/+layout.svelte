<script lang="ts">
    import './layout.css';
    import { onMount } from 'svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
    import ToastHost from '#lib/components/common/ToastHost.svelte';
    import { markHydrated } from '#lib/ui/viewport.svelte.ts';
    import { initRouteMotion } from '#lib/ui/route-motion.ts';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();

    onMount(markHydrated);
    initRouteMotion();
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="application-name" content={SERVICE_NAME} />
</svelte:head>

<a
    href="#main-content"
    class="fixed top-2 left-4 z-[60] -translate-y-24 border border-line bg-surface px-4 py-2 focus:translate-y-0"
>
    본문으로 건너뛰기
</a>
{@render children()}
<ConfirmDialog />
<ToastHost />
