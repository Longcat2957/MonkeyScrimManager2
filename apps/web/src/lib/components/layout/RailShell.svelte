<script lang="ts">
    import type { Snippet } from 'svelte';
    import { ambientGlow } from '#lib/ui/ambient.ts';
    import AppFooter from './AppFooter.svelte';
    import AppHeader from './AppHeader.svelte';

    // 서버·계정 문맥이 있는 화면의 셸. 1024px 이상은 왼쪽 레일, 그 미만은 상단 바와 메뉴 시트다.
    let { children }: { children: Snippet } = $props();
    let accountHeight = $state(0);
</script>

<div class="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
    <AppHeader bind:accountHeight />
    <div class="flex min-h-dvh min-w-0 flex-col" style:--account-height={`${accountHeight}px`}>
        <main
            id="main-content"
            tabindex="-1"
            class="app-main min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:pl-6"
            {@attach ambientGlow}
        >
            <div aria-hidden="true" class="ambient-clip">
                <div class="ambient-glow"></div>
            </div>
            <div class="route-content">{@render children()}</div>
        </main>
        <AppFooter shell="rail" />
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
