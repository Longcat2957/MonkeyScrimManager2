<script lang="ts">
    import { asset, resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';

    let { wordmark = true, class: className = '' }: { wordmark?: boolean; class?: string } = $props();
</script>

<a
    href={resolve('/(site)')}
    class={['flex shrink-0 items-center gap-2.5 px-1 py-0.5 no-underline', className]}
    aria-label={`${SERVICE_NAME} 홈`}
>
    <img
        src={asset('brand/logo.png')}
        alt=""
        width="34"
        height="34"
        class="size-8.5 rounded-full border border-nexus"
    />
    {#if wordmark}
        <span class="rail-label font-brand text-[1.3125rem] leading-none font-bold tracking-[-0.02em]"
            >{SERVICE_NAME}</span
        >
    {/if}
</a>
