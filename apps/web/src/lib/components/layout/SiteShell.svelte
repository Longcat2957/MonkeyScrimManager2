<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import { ambientGlow } from '#lib/ui/ambient.ts';
    import AppFooter from './AppFooter.svelte';
    import SiteHeader from './SiteHeader.svelte';

    // 서버 문맥이 없는 소개·안내·정책 화면의 셸. 모든 화면 폭에서 상단 바를 쓴다.
    let { children }: { children: Snippet } = $props();
    // 시안 배경광은 소개 화면에만 둔다. 반투명 상단 바 뒤까지 화면 위쪽 전체에서 번지게 한다.
    const landing = $derived(page.route.id === '/(site)');
</script>

{#snippet content()}
    <SiteHeader />
    <main id="main-content" tabindex="-1" class="min-w-0 flex-1 px-4 pt-6 pb-16 md:px-6 md:pt-10">
        {@render children()}
    </main>
    <AppFooter shell="site" />
{/snippet}

{#if landing}
    <div class="relative isolate flex min-h-dvh flex-col" {@attach ambientGlow}>
        <div aria-hidden="true" class="ambient-clip">
            <div class="ambient-glow"></div>
        </div>
        {@render content()}
    </div>
{:else}
    <div class="flex min-h-dvh flex-col">
        {@render content()}
    </div>
{/if}
