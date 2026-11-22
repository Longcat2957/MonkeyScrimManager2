<script lang="ts">
    import type { Snippet } from 'svelte';

    type Props = {
        open?: boolean;
        title: string;
        wide?: boolean;
        // 바깥 클릭·Escape로 닫히지 않게 해야 하는 확인 창은 false로 둔다.
        dismissible?: boolean;
        onclose?: () => void;
        oncancel?: () => void;
        children: Snippet;
        footer?: Snippet;
    };

    let {
        open = $bindable(false),
        title,
        wide = false,
        dismissible = true,
        onclose,
        oncancel,
        children,
        footer
    }: Props = $props();

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
        // 이전 닫기 이벤트가 뒤늦게 도착해 다시 연 창을 닫지 않도록 한다.
        if (dialog?.open) return;
        open = false;
        onclose?.();
    }

    function cancel(event: Event) {
        event.preventDefault();
        if (dismissible) open = false;
        oncancel?.();
    }

    function backdrop(event: MouseEvent) {
        if (dismissible && event.target === dialog) open = false;
    }
</script>

<dialog
    bind:this={dialog}
    oncancel={cancel}
    onclose={closed}
    onclick={backdrop}
    class={[
        'm-auto max-h-[85dvh] overflow-hidden rounded-box border border-line-strong bg-surface p-0 text-ink backdrop:bg-black/60',
        wide ? 'w-[min(62rem,calc(100%-1rem))]' : 'w-[min(36rem,calc(100%-2rem))]'
    ]}
    aria-labelledby={`${id}-title`}
>
    <div class="flex max-h-[85dvh] flex-col">
        <header class="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
            <h2 id={`${id}-title`} class="min-w-0 text-base font-bold">{title}</h2>
            {#if dismissible}
                <button
                    type="button"
                    class="min-h-9 shrink-0 rounded-form px-2.5 text-ui font-semibold text-ink-2 hover:bg-surface-hover pointer-coarse:min-h-11"
                    onclick={() => (open = false)}
                >
                    닫기
                </button>
            {/if}
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
            {@render children()}
        </div>
        {#if footer}
            <footer class="border-t border-line bg-surface-2 px-4 py-3">{@render footer()}</footer>
        {/if}
    </div>
</dialog>
