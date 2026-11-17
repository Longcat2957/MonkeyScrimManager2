<script lang="ts">
    import './layout.css';
    import { onMount } from 'svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import AppHeader from '#lib/components/layout/AppHeader.svelte';
    import AppFooter from '#lib/components/layout/AppFooter.svelte';
    import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
    import ToastHost from '#lib/components/common/ToastHost.svelte';
    import { markHydrated } from '#lib/ui/viewport.svelte.ts';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();

    onMount(markHydrated);
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="application-name" content={SERVICE_NAME} />
</svelte:head>

<div class="min-h-dvh lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
    <a
        href="#main-content"
        class="fixed top-2 left-4 z-[60] -translate-y-24 border border-border bg-bg-surface px-4 py-2 focus:translate-y-0 dark:bg-bg-surface-dark"
    >
        본문으로 건너뛰기
    </a>
    <AppHeader />
    <div class="flex min-h-dvh min-w-0 flex-col">
        <main
            id="main-content"
            tabindex="-1"
            class="app-main min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:pl-6"
        >
            {@render children()}
        </main>
        <AppFooter />
    </div>
</div>
<ConfirmDialog />
<ToastHost />
