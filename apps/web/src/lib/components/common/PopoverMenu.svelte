<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { MenuAction } from '#lib/components/common/menu.ts';

    type Props = {
        open?: boolean;
        label: string;
        actions: MenuAction[];
        align?: 'left' | 'right';
        side?: 'down' | 'up';
        onselect: (index: number) => void;
        onclose?: () => void;
        footer?: Snippet;
    };

    let {
        open = $bindable(false),
        label,
        actions,
        align = 'left',
        side = 'down',
        onselect,
        onclose,
        footer
    }: Props = $props();

    let panel = $state<HTMLDivElement | null>(null);

    function close(restoreFocus = false) {
        if (restoreFocus) panel?.parentElement?.querySelector<HTMLElement>(':scope > button')?.focus();
        open = false;
        onclose?.();
    }

    function choose(index: number) {
        if (actions[index]?.disabled) return;
        close(true);
        onselect(index);
    }

    // 바깥 클릭·Escape를 한 곳에서 처리하고, 열릴 때 첫 항목으로 포커스를 옮긴다.
    $effect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (!panel) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(true);
                return;
            }
            if (
                !(event.target instanceof HTMLElement) ||
                !event.target.matches('[role="menuitem"]') ||
                !panel.contains(event.target)
            )
                return;
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
            const index = items.indexOf(event.target);
            if (event.key === 'Home') items[0]?.focus();
            else if (event.key === 'End') items.at(-1)?.focus();
            else items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        };
        const outside = (event: Event) => {
            if (panel && event.target instanceof Node && !panel.parentElement?.contains(event.target))
                close();
        };
        window.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('focusin', outside);
        queueMicrotask(() => {
            (panel?.querySelector<HTMLElement>('button:not([disabled])') ?? panel)?.focus();
        });
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('focusin', outside);
        };
    });
</script>

{#if open}
    <div
        bind:this={panel}
        tabindex="-1"
        class={[
            'absolute z-[1600] max-h-[50dvh] w-max min-w-48 max-w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-box border border-line-strong bg-surface-2 p-1.5 text-ink',
            align === 'right' ? 'right-0' : 'left-0',
            side === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
        ]}
    >
        <div role="menu" aria-label={label} class="flex flex-col gap-0.5">
            {#each actions as action, index (index)}
                <button
                    type="button"
                    role="menuitem"
                    disabled={action.disabled}
                    aria-current={action.current ? 'true' : undefined}
                    class={[
                        'flex min-h-9 w-full flex-col items-start justify-center gap-0.5 rounded-small px-2.5 py-1.5 text-left text-ui hover:bg-surface-hover disabled:cursor-not-allowed pointer-coarse:min-h-11',
                        action.disabled && !action.current && 'text-muted',
                        action.current && 'bg-selected font-semibold text-nexus',
                        action.danger && 'text-error'
                    ]}
                    onclick={() => choose(index)}
                >
                    <span>{action.content}</span>
                    {#if action.desc}<span class="text-xs text-muted">{action.desc}</span>{/if}
                </button>
            {/each}
        </div>
        {#if footer}
            <div class="mt-1 border-t border-line pt-1" role="group" aria-label="화면 설정">
                {@render footer()}
            </div>
        {/if}
    </div>
{/if}
