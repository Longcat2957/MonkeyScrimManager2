<script lang="ts">
    import { resolve } from '$app/paths';
    import { SERVICE_NAME, SERVICE_URL } from '#lib/branding.ts';
    import { CONTACT_EMAIL } from '#lib/branding.ts';

    const serviceDomain = new URL(SERVICE_URL).hostname;
    const footerLinks = [
        { label: '문서', href: resolve('/(app)/docs') },
        { label: '이용약관', href: resolve('/(app)/terms') },
        { label: '개인정보 처리방침', href: resolve('/(app)/privacy') },
        { label: '문의', href: `mailto:${CONTACT_EMAIL}` }
    ] as const;
</script>

<footer class="border-t border-line bg-rail lg:grid lg:min-h-(--account-height) lg:items-center">
    <div
        class="flex flex-col gap-1 px-4 py-2 text-ink-2 sm:flex-row sm:items-center sm:justify-between md:px-6"
    >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-brand text-base font-bold tracking-[-0.02em] text-ink">{SERVICE_NAME}</span>
            <span class="text-xs text-muted">{serviceDomain}</span>
        </div>

        <nav aria-label="서비스 정책 및 안내" class="-mx-2 flex flex-wrap items-center text-ui">
            {#each footerLinks as link (link.href)}
                <a
                    href={link.href}
                    class={[
                        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-form px-2 underline-offset-4 hover:underline',
                        link.href === resolve('/(app)/privacy') && 'font-semibold'
                    ]}
                >
                    {link.label}
                </a>
            {/each}
        </nav>
    </div>
</footer>
