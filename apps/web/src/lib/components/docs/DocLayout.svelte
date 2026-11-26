<script lang="ts">
    import type { Snippet } from 'svelte';
    import DocToc from './DocToc.svelte';
    import type { DocHeading } from './toc.ts';

    type Props = {
        title: string;
        /** 제목 아래의 한 문단 요약. 본문에서 반복하지 않는 내용만 넣는다. */
        lead?: string;
        meta?: Snippet;
        sections: DocHeading[];
        children: Snippet;
    };

    let { title, lead, meta, sections, children }: Props = $props();
    let measured = $state('');
    // 측정 전(SSR·첫 페인트)에는 첫 장을 현재 장으로 표시한다.
    const current = $derived(measured || (sections[0]?.id ?? ''));

    // 상단 바 아래 기준선을 지난 마지막 장을 현재 장으로 본다. 문서 끝에서는 마지막 장이다.
    $effect(() => {
        let frame = 0;
        function update() {
            frame = 0;
            const line = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            let next = sections[0]?.id ?? '';
            for (const { id } of sections) {
                const node = document.getElementById(id);
                if (node && node.getBoundingClientRect().top <= line + 1) next = id;
            }
            if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
                next = sections.at(-1)?.id ?? next;
            measured = next;
        }
        function schedule() {
            frame ||= requestAnimationFrame(update);
        }
        update();
        addEventListener('scroll', schedule, { passive: true });
        addEventListener('resize', schedule);
        return () => {
            cancelAnimationFrame(frame);
            removeEventListener('scroll', schedule);
            removeEventListener('resize', schedule);
        };
    });
</script>

<div class="mx-auto grid max-w-6xl gap-x-14 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
    <aside class="hidden lg:block">
        <div class="sticky top-[calc(var(--app-header-height)+2.5rem)]">
            <DocToc {sections} {current} />
        </div>
    </aside>
    <article class="min-w-0">
        <header class="max-w-[42rem] border-b border-line pb-7">
            <h1 class="text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-4xl">
                {title}
            </h1>
            {#if lead}<p class="mt-4 text-base leading-relaxed text-ink-2">{lead}</p>{/if}
            {#if meta}
                <div class="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">{@render meta()}</div>
            {/if}
        </header>
        <div class="mt-6 lg:hidden">
            <DocToc {sections} {current} collapsible />
        </div>
        <div class="doc pt-8 sm:pt-10">
            {@render children()}
        </div>
    </article>
</div>
