<script lang="ts">
    import type { Snippet } from 'svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';

    let { title, children }: { title: string; children: Snippet } = $props();
</script>

<article class="mx-auto max-w-[72ch] py-6 sm:py-12">
    <header class="space-y-3 border-y border-line-strong py-6">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>운영 주체: {SERVICE_NAME} 운영팀</span>
            <span>시행일: <time datetime="2026-11-25">2026년 11월 25일</time></span>
        </p>
    </header>
    <div
        class="space-y-8 pt-7 leading-7 break-keep text-ink-2 [overflow-wrap:anywhere] [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li+li]:mt-2 [&_section>*+*]:mt-3 [&_ul]:list-disc [&_ul]:ps-5"
    >
        {@render children()}
    </div>
</article>
