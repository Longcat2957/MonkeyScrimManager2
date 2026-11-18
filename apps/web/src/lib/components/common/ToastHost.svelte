<script lang="ts">
    import { dismissToast, toasts } from '#lib/ui/toast.ts';

    const TONE = {
        success: 'border-success/60 text-success',
        error: 'border-error/60 text-error',
        info: 'border-info/60 text-info'
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
                'pointer-events-auto flex w-fit max-w-full items-center justify-between gap-3 rounded-form border bg-surface-2 py-1 pr-1.5 pl-3 text-ui font-semibold sm:max-w-md',
                TONE[item.tone]
            ]}
        >
            <span>{item.message}</span>
            <button
                type="button"
                class="min-h-9 shrink-0 rounded-form px-2 text-xs text-ink-2 hover:bg-surface-hover pointer-coarse:min-h-11"
                onclick={() => dismissToast(item.id)}
            >
                닫기
            </button>
        </div>
    {/each}
</div>
