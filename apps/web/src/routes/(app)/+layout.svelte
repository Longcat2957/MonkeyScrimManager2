<script lang="ts">
    import type { Snippet } from 'svelte';
    import AppHeader from '#lib/components/layout/AppHeader.svelte';
    import AppFooter from '#lib/components/layout/AppFooter.svelte';

    let { children }: { children: Snippet } = $props();
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
</script>

<div class="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
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

<style>
    /* 경매판의 열 배치를 바꾸지 않고 긴 본문만 스크롤해 푸터를 계정 바와 맞춘다. */
    @media (width >= 64rem) {
        div:has(> main :global([data-auction-board])) {
            height: 100dvh;
        }
        main:has(:global([data-auction-board])) {
            min-height: 0;
            overflow-y: auto;
        }
    }
</style>
