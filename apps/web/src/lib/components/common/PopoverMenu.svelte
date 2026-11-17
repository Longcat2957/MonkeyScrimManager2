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

    function close() {
        open = false;
        onclose?.();
    }

    function choose(index: number) {
        if (actions[index]?.disabled) return;
        close();
        onselect(index);
    }

    // 바깥 클릭·Escape를 한 곳에서 처리하고, 열릴 때 첫 항목으로 포커스를 옮긴다.
    $effect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        const onPointer = (event: PointerEvent) => {
            if (!panel) return;
            if (
                !panel.contains(event.target as Node) &&
                !(event.target as Element).closest('[data-menu-trigger]')
            )
                close();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointer, true);
        queueMicrotask(() => panel?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointer, true);
        };
    });
</script>

{#if open}
    <div
        bind:this={panel}
        role="menu"
        aria-label={label}
        class={[
            'absolute z-[1600] min-w-56 rounded-(--radius-form) border border-brass-line bg-bg-surface p-1 text-text-primary shadow-[0_12px_32px_rgb(0_0_0/35%)] dark:bg-bg-surface-dark dark:text-text-dark',
            align === 'right' ? 'right-0' : 'left-0',
            side === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
        ]}
    >
        {#each actions as action, index (action.content)}
            <button
                type="button"
                role="menuitem"
                disabled={action.disabled}
                aria-current={action.current ? 'true' : undefined}
                class={[
                    'flex w-full flex-col items-start gap-0.5 rounded-(--radius-small) px-3 py-2 text-left text-sm',
                    'hover:bg-bg-highlight disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-bg-highlight-dark',
                    action.current && 'font-semibold text-hex',
                    action.danger && 'text-error'
                ]}
                onclick={() => choose(index)}
            >
                <span>{action.content}</span>
                {#if action.desc}<span class="text-xs text-text-muted">{action.desc}</span>{/if}
            </button>
        {/each}
        {#if footer}
            <div class="mt-1 border-t border-brass-line pt-1" role="group" aria-label="화면 설정">
                {@render footer()}
            </div>
        {/if}
    </div>
{/if}
