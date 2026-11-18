<script lang="ts">
    import type { Snippet } from 'svelte';

    type Item = { title: string };

    type Props = {
        items: Item[];
        multiple?: boolean;
        border?: 'solid' | 'none';
        children?: Snippet<[unknown, number]>;
    };

    let { items, multiple = false, border = 'solid', children }: Props = $props();

    // 하나만 열리는 아코디언도 details 네이티브 동작을 유지하며, 열릴 때 다른 항목을 접는다.
    function toggle(event: Event) {
        if (multiple) return;
        const target = event.currentTarget as HTMLDetailsElement;
        if (!target.open) return;
        for (const other of target.parentElement?.querySelectorAll('details') ?? []) {
            if (other !== target) other.open = false;
        }
    }
</script>

<div class="flex flex-col">
    {#each items as item, index (item.title)}
        <details
            class={['group', border === 'solid' && 'border-b border-line last:border-b-0']}
            ontoggle={toggle}
        >
            <summary
                class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold hover:text-nexus"
            >
                <span>{item.title}</span>
                <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    class="size-4 shrink-0 text-muted group-open:rotate-180 motion-safe:transition-transform"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"><path d="m4 6 4 4 4-4" /></svg
                >
            </summary>
            <div class="pb-3 text-sm leading-relaxed text-ink-2">
                {#if children}{@render children(item, index)}{/if}
            </div>
        </details>
    {/each}
</div>
