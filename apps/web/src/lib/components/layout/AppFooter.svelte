<script lang="ts">
    import { resolve } from '$app/paths';
    import { CONTACT_EMAIL, SERVICE_NAME, SERVICE_URL } from '#lib/branding.ts';

    const serviceDomain = new URL(SERVICE_URL).hostname;
    const footerLinks = [
        { label: '문서', href: resolve('/docs') },
        { label: '이용약관', href: resolve('/terms') },
        { label: '개인정보 처리방침', href: resolve('/privacy') },
        { label: '문의', href: `mailto:${CONTACT_EMAIL}` }
    ] as const;
</script>

<footer class="border-t border-border">
    <div
        class="app-frame flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between md:px-10"
    >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-brand text-xl font-normal no-underline [font-synthesis:none]">
                {SERVICE_NAME}
            </span>
            <span class="text-xs text-text-primary/60 dark:text-text-dark/60">
                {serviceDomain}
            </span>
        </div>

        <nav aria-label="서비스 정책 및 안내" class="-mx-2 flex flex-wrap items-center text-sm">
            {#each footerLinks as link (link.href)}
                <a
                    href={link.href}
                    class={[
                        'inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline-offset-4 hover:underline',
                        { 'font-semibold': link.href === resolve('/privacy') }
                    ]}
                >
                    {link.label}
                </a>
            {/each}
        </nav>
    </div>
</footer>
