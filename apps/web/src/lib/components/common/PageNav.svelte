<script lang="ts">
    import type { Snippet } from 'svelte';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type Props = {
        total: number;
        pageSize: number;
        current: number;
        label?: string;
    } & (
        | { onchange: (page: number) => void; hrefFor?: never }
        | { hrefFor: (page: number) => string; onchange?: never }
    );

    let { total, pageSize, current, onchange, hrefFor, label = '쪽 이동' }: Props = $props();

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

{#snippet pageControl(target: number, content: Snippet, name?: string, selected = false)}
    {@const disabled = target < 1 || target > pages}
    {@const style = [control, selected ? 'border-nexus bg-selected text-ink' : quiet]}
    {#if hrefFor && !disabled}
        <a
            href={hrefFor(target)}
            class={style}
            aria-label={name}
            aria-current={selected ? 'page' : undefined}
        >
            {@render content()}
        </a>
    {:else}
        <button
            type="button"
            class={style}
            {disabled}
            aria-label={name}
            aria-current={selected ? 'page' : undefined}
            onclick={() => onchange?.(target)}
        >
            {@render content()}
        </button>
    {/if}
{/snippet}

{#if total > pageSize}
    <nav aria-label={label} class="flex flex-wrap items-center justify-center gap-1 pt-2">
        {#snippet previous()}
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m10 3-5 5 5 5" /></svg
            >
        {/snippet}
        {@render pageControl(current - 1, previous, '이전 쪽')}
        {#each visible as page, index (index)}
            {#if page === -1}
                <span class="px-0.5 text-ui text-muted" aria-hidden="true">…</span>
            {:else}
                {#snippet number()}{page}{/snippet}
                {@render pageControl(page, number, undefined, page === current)}
            {/if}
        {/each}
        {#snippet next()}
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m6 3 5 5-5 5" /></svg
            >
        {/snippet}
        {@render pageControl(current + 1, next, '다음 쪽')}
    </nav>
{/if}
