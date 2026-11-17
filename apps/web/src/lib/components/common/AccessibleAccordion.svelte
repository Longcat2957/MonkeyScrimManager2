<script lang="ts">
    import type { Snippet } from 'svelte';

    type Item = { title: string };

    type Props = {
        items: Item[];
        multiple?: boolean;
        border?: 'solid' | 'none';
        children?: Snippet<[unknown, number]>;
    };

    let { items, multiple = false, children }: Props = $props();

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
        <details class="group border-b border-brass-line last:border-b-0" ontoggle={toggle}>
            <summary
                class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold"
            >
                <span>{item.title}</span>
                <span aria-hidden="true" class="text-text-muted transition-transform group-open:rotate-180"
                    >▾</span
                >
            </summary>
            <div class="pb-3 text-sm">
                {#if children}{@render children(item, index)}{/if}
            </div>
        </details>
    {/each}
</div>
