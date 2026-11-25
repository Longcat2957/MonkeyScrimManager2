<script lang="ts">
    import { asset } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import AppFooter from '#lib/components/layout/AppFooter.svelte';
    import { serverHome } from '#lib/components/layout/navigation.ts';
</script>

<div class="flex min-h-dvh flex-col">
    <header class="border-b border-line bg-rail">
        <div class="mx-auto flex min-h-14 max-w-6xl items-center justify-between px-4 sm:min-h-16 sm:px-6">
            <h1 class="flex items-center gap-2.5 font-brand text-xl font-bold">
                <img src={asset('brand/logo.png')} alt="" width="32" height="32" class="rounded-full" />
                {SERVICE_NAME}
            </h1>
            <Button href={serverHome()}>내 서버</Button>
        </div>
    </header>
    <main id="main-content" tabindex="-1" class="flex-1"></main>
    <AppFooter />
</div>
