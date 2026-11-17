<script lang="ts">
    import { dismissToast, toasts } from '#lib/ui/toast.ts';

    const TONE = {
        success: 'border-success/60 bg-bg-surface text-success dark:bg-bg-surface-dark',
        error: 'border-error/60 bg-bg-surface text-error dark:bg-bg-surface-dark',
        info: 'border-info/60 bg-bg-surface text-info dark:bg-bg-surface-dark'
    } as const;
</script>

<!-- 토스트는 상태 알림이므로 aria-live로 읽히게 하고, 각 항목은 직접 닫을 수 있다. -->
<div
    class="pointer-events-none fixed inset-x-0 bottom-6 z-[1700] flex flex-col items-center gap-2 px-4"
    aria-live="polite"
    aria-atomic="false"
>
    {#each $toasts as item (item.id)}
        <div
            class={[
                'pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 border px-4 py-3 text-sm font-semibold shadow-[0_8px_24px_rgb(0_0_0/25%)]',
                'rounded-(--radius-form)',
                TONE[item.tone]
            ]}
        >
            <span>{item.message}</span>
            <button
                type="button"
                class="shrink-0 rounded-(--radius-small) px-1 text-xs opacity-70 hover:opacity-100"
                onclick={() => dismissToast(item.id)}
            >
                닫기
            </button>
        </div>
    {/each}
</div>
