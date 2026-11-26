<script lang="ts">
    import type { Snippet } from 'svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import DocLayout from './DocLayout.svelte';
    import type { DocHeading } from './toc.ts';

    // 약관·처리방침은 같은 운영 주체와 시행일을 제목 아래에 밝힌다.
    let { title, sections, children }: { title: string; sections: DocHeading[]; children: Snippet } =
        $props();
</script>

<DocLayout {title} {sections} {children}>
    {#snippet meta()}
        <span>운영 주체: {SERVICE_NAME} 운영팀</span>
        <span>시행일: <time datetime="2026-11-25">2026년 11월 25일</time></span>
    {/snippet}
</DocLayout>
