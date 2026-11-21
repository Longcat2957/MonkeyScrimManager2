<script lang="ts">
    import './layout.css';
    import { onMount } from 'svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import AppHeader from '#lib/components/layout/AppHeader.svelte';
    import AppFooter from '#lib/components/layout/AppFooter.svelte';
    import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
    import ToastHost from '#lib/components/common/ToastHost.svelte';
    import { markHydrated } from '#lib/ui/viewport.svelte.ts';
    import { initRouteMotion } from '#lib/ui/route-motion.ts';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
    let accountHeight = $state(0);
    let glow: HTMLDivElement;

    function moveGlow(event: PointerEvent & { currentTarget: HTMLElement }) {
        if (event.pointerType !== 'mouse') return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const left = 1 - (event.clientX - bounds.left) / bounds.width;
        const down = event.clientY / innerHeight;
        const sweep = `translate(${-42 * left}cqw, ${18 * down}svh)`;
        const beam = `rotate(${8 - down * 54}deg) scale(${1 + left * 0.7}, ${1 - left * 0.25})`;
        glow.style.setProperty('--glow-shape', `${sweep} ${beam}`);
    }

    onMount(markHydrated);
    initRouteMotion();
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="application-name" content={SERVICE_NAME} />
</svelte:head>

<div class="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
    <a
        href="#main-content"
        class="fixed top-2 left-4 z-[60] -translate-y-24 border border-line bg-surface px-4 py-2 focus:translate-y-0"
    >
        본문으로 건너뛰기
    </a>
    <AppHeader bind:accountHeight />
    <div class="flex min-h-dvh min-w-0 flex-col" style:--account-height={`${accountHeight}px`}>
        <main
            id="main-content"
            tabindex="-1"
            class="app-main min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:pl-6"
            onpointermove={moveGlow}
            onpointerleave={() => glow.style.removeProperty('--glow-shape')}
        >
            <div aria-hidden="true" class="ambient-clip">
                <div bind:this={glow} class="ambient-glow"></div>
            </div>
            <div class="route-content">{@render children()}</div>
        </main>
        <AppFooter />
    </div>
</div>
<ConfirmDialog />
<ToastHost />
