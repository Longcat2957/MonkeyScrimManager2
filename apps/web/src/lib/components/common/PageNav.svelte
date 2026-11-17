<script lang="ts">
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type Props = {
        total: number;
        pageSize: number;
        current: number;
        onchange: (page: number) => void;
        label?: string;
    };

    let { total, pageSize, current, onchange, label = '쪽 이동' }: Props = $props();

    const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
    // 현재 쪽 주변만 보여 주고 첫·마지막 쪽은 항상 남긴다.
    const visible = $derived.by(() => {
        const max = desktop.current ? 7 : 5;
        if (pages <= max) return Array.from({ length: pages }, (_, index) => index + 1);
        const window = [1];
        const from = Math.max(2, current - 1);
        const to = Math.min(pages - 1, current + 1);
        if (from > 2) window.push(-1);
        for (let page = from; page <= to; page++) window.push(page);
        if (to < pages - 1) window.push(-1);
        window.push(pages);
        return window;
    });
</script>

{#if total > pageSize}
    <nav aria-label={label} class="flex items-center justify-center gap-1 pt-2">
        <button
            type="button"
            class="min-h-11 min-w-11 rounded-(--radius-small) border border-brass-line text-sm disabled:opacity-40"
            disabled={current <= 1}
            aria-label="이전 쪽"
            onclick={() => onchange(current - 1)}
        >
            ‹
        </button>
        {#each visible as page, index (index)}
            {#if page === -1}
                <span class="px-0.5 text-sm text-text-muted" aria-hidden="true">…</span>
            {:else}
                <button
                    type="button"
                    class={[
                        'min-h-11 min-w-11 rounded-(--radius-small) border text-sm font-semibold',
                        page === current
                            ? 'border-hex bg-hex/10 text-hex'
                            : 'border-brass-line text-text-muted hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
                    ]}
                    aria-current={page === current ? 'page' : undefined}
                    onclick={() => onchange(page)}
                >
                    {page}
                </button>
            {/if}
        {/each}
        <button
            type="button"
            class="min-h-11 min-w-11 rounded-(--radius-small) border border-brass-line text-sm disabled:opacity-40"
            disabled={current >= Math.ceil(total / pageSize)}
            onclick={() => onchange(current + 1)}
        >
            <span class="sr-only">다음 쪽</span>
            <span aria-hidden="true">›</span>
        </button>
    </nav>
{/if}
