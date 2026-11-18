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
    const control =
        'inline-flex min-h-9 min-w-9 items-center justify-center rounded-form border text-ui font-semibold pointer-coarse:min-h-11 pointer-coarse:min-w-11';
    const quiet =
        'border-line-strong bg-surface text-ink-2 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45';
</script>

{#if total > pageSize}
    <nav aria-label={label} class="flex flex-wrap items-center justify-center gap-1 pt-2">
        <button
            type="button"
            class={[control, quiet]}
            disabled={current <= 1}
            aria-label="이전 쪽"
            onclick={() => onchange(current - 1)}
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m10 3-5 5 5 5" /></svg
            >
        </button>
        {#each visible as page, index (index)}
            {#if page === -1}
                <span class="px-0.5 text-ui text-muted" aria-hidden="true">…</span>
            {:else}
                <button
                    type="button"
                    class={[control, page === current ? 'border-nexus bg-selected text-ink' : quiet]}
                    aria-current={page === current ? 'page' : undefined}
                    onclick={() => onchange(page)}
                >
                    {page}
                </button>
            {/if}
        {/each}
        <button
            type="button"
            class={[control, quiet]}
            disabled={current >= Math.ceil(total / pageSize)}
            onclick={() => onchange(current + 1)}
        >
            <span class="sr-only">다음 쪽</span>
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m6 3 5 5-5 5" /></svg
            >
        </button>
    </nav>
{/if}
