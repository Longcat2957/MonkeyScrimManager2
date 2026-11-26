<script lang="ts">
    import type { DocHeading } from './toc.ts';

    // 넓은 화면은 고정 목차, 좁은 화면은 펼침 목차다. 두 배치는 레이아웃이 CSS로 하나만 보여 준다.
    let {
        sections,
        current,
        collapsible = false
    }: { sections: DocHeading[]; current: string; collapsible?: boolean } = $props();
    let open = $state(false);
    const currentTitle = $derived(sections.find(({ id }) => id === current)?.title ?? '');
</script>

{#snippet links()}
    <ol class="flex flex-col gap-0.5">
        {#each sections as section (section.id)}
            <li>
                <a
                    href={`#${section.id}`}
                    aria-current={section.id === current ? 'location' : undefined}
                    onclick={() => (open = false)}
                    class="flex min-h-9 items-center rounded-form border border-transparent px-3 py-1.5 text-ui leading-snug text-muted no-underline hover:bg-surface-hover hover:text-ink focus-visible:-outline-offset-2 aria-[current=location]:border-nexus aria-[current=location]:bg-selected aria-[current=location]:font-semibold aria-[current=location]:text-ink pointer-coarse:min-h-11"
                >
                    {section.title}
                </a>
            </li>
        {/each}
    </ol>
{/snippet}

{#if collapsible}
    <details bind:open class="group rounded-box border border-line bg-surface">
        <summary
            class="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-ui [&::-webkit-details-marker]:hidden"
        >
            <span class="font-semibold text-ink">목차</span>
            <span class="min-w-0 flex-1 truncate text-muted">{currentTitle}</span>
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class="size-4 shrink-0 text-muted group-open:rotate-180 motion-safe:transition-transform"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m4 6 4 4 4-4" /></svg
            >
        </summary>
        <nav aria-label="목차" class="border-t border-line p-2">
            {@render links()}
        </nav>
    </details>
{:else}
    <nav aria-label="목차">
        <p class="mb-2 px-3 text-xs font-semibold text-muted">목차</p>
        {@render links()}
    </nav>
{/if}
