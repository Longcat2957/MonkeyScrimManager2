<script lang="ts">
    import type { Snippet } from 'svelte';

    type Props = {
        open?: boolean;
        title: string;
        // 바깥 클릭·Escape로 닫히지 않게 해야 하는 확인 창은 false로 둔다.
        dismissible?: boolean;
        onclose?: () => void;
        children: Snippet;
        footer?: Snippet;
    };

    let { open = $bindable(false), title, dismissible = true, onclose, children, footer }: Props = $props();

    const id = $props.id();
    let dialog = $state<HTMLDialogElement | null>(null);

    // 네이티브 dialog가 포커스 가둠·복귀·Escape를 처리한다.
    $effect(() => {
        const node = dialog;
        if (!node) return;
        if (open && !node.open) node.showModal();
        else if (!open && node.open) node.close();
    });

    function closed() {
        open = false;
        onclose?.();
    }

    function cancel(event: Event) {
        if (!dismissible) event.preventDefault();
    }

    function backdrop(event: MouseEvent) {
        if (dismissible && event.target === dialog) dialog?.close();
    }
</script>

<dialog
    bind:this={dialog}
    oncancel={cancel}
    onclose={closed}
    onclick={backdrop}
    class="m-auto w-[min(36rem,calc(100%-2rem))] max-h-[85dvh] overflow-hidden rounded-(--radius-box) border border-brass-line bg-bg-surface p-0 text-text-primary shadow-[0_24px_64px_rgb(0_0_0/45%)] backdrop:bg-black/55 dark:bg-bg-surface-dark dark:text-text-dark"
    aria-labelledby={`${id}-title`}
>
    <div class="flex max-h-[85dvh] flex-col">
        <header class="flex items-center justify-between gap-4 border-b border-brass-line px-5 py-4">
            <h2 id={`${id}-title`} class="text-lg font-semibold">{title}</h2>
            {#if dismissible}
                <button
                    type="button"
                    class="rounded-(--radius-small) px-2 py-1 text-sm text-text-muted hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark"
                    onclick={() => dialog?.close()}
                >
                    닫기
                </button>
            {/if}
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {@render children()}
        </div>
        {#if footer}
            <footer class="border-t border-brass-line px-5 py-4">{@render footer()}</footer>
        {/if}
    </div>
</dialog>
