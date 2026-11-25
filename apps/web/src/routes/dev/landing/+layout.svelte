<script lang="ts">
    import { asset } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import AppFooter from '#lib/components/layout/AppFooter.svelte';
    import { serverHome } from '#lib/components/layout/navigation.ts';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-dvh flex-col">
    <header class="border-b border-line bg-rail">
        <div
            class="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-3 px-4 py-1 sm:min-h-16 sm:gap-x-8 sm:px-6"
        >
            <span
                class="flex items-center gap-2.5 font-brand text-lg leading-none font-bold tracking-[-0.02em] sm:text-xl"
            >
                <img
                    src={asset('brand/logo.png')}
                    alt=""
                    width="32"
                    height="32"
                    class="hidden rounded-full sm:block"
                />
                {SERVICE_NAME}
            </span>
            <nav
                aria-label="페이지 탐색"
                class="ml-auto flex flex-wrap gap-x-2 text-ui font-semibold text-ink-2 sm:gap-x-5"
            >
                <a href="#try-scrim" class="inline-flex min-h-11 items-center hover:text-nexus">내전 체험</a>
                <a
                    href="#first-scrim"
                    class="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-nexus"
                    >사용법</a
                >
            </nav>
            <Button href={serverHome()}>내 서버</Button>
        </div>
    </header>
    <main id="main-content" tabindex="-1" class="min-w-0 flex-1 px-4 sm:px-6">{@render children()}</main>
    <AppFooter />
</div>
