<script lang="ts">
    import { resolve } from '$app/paths';
    import { SERVICE_NAME, SERVICE_URL } from '#lib/branding.ts';
    import { CONTACT_EMAIL } from '#lib/branding.ts';

    const serviceDomain = new URL(SERVICE_URL).hostname;
    const footerLinks = [
        { label: '문서', href: resolve('/docs') },
        { label: '이용약관', href: resolve('/terms') },
        { label: '개인정보 처리방침', href: resolve('/privacy') },
        { label: '문의', href: `mailto:${CONTACT_EMAIL}` }
    ] as const;
</script>

<footer class="border-t border-brass-line bg-crown dark:bg-crown">
    <div
        class="flex flex-col gap-2 px-4 py-3 text-text-primary sm:flex-row sm:items-center sm:justify-between md:px-6 dark:text-text-dark"
    >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-brand text-lg font-bold tracking-wide">{SERVICE_NAME}</span>
            <span class="text-xs text-text-muted">{serviceDomain}</span>
        </div>

        <nav aria-label="서비스 정책 및 안내" class="-mx-2 flex flex-wrap items-center text-sm">
            {#each footerLinks as link (link.href)}
                <a
                    href={link.href}
                    class={[
                        'inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline-offset-4 hover:underline',
                        link.href === resolve('/privacy') && 'font-semibold'
                    ]}
                >
                    {link.label}
                </a>
            {/each}
        </nav>
    </div>
</footer>
