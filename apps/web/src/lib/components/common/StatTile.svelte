<script module lang="ts">
    export type StatTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';

    // 지표 하나를 크게 보여 주는 칸. 색은 지표 묶음을 구분하는 장식이라 값의 좋고 나쁨을 뜻하지 않는다.
    let {
        label,
        value,
        note = null,
        tone = 'neutral',
        icon
    }: {
        label: string;
        value: string;
        note?: string | null;
        tone?: StatTone;
        icon?: Snippet;
    } = $props();

    const TONE: Record<StatTone, { box: string; accent: string }> = {
        neutral: { box: 'border-border bg-bg-surface dark:bg-bg-surface-dark', accent: '' },
        info: { box: 'border-info/30 bg-info/5 dark:bg-info/10', accent: 'text-info dark:text-dark' },
        success: {
            box: 'border-success/30 bg-success/5 dark:bg-success/10',
            accent: 'text-success dark:text-dark'
        },
        warning: {
            box: 'border-warning/30 bg-warning/5 dark:bg-warning/10',
            accent: 'text-warning dark:text-dark'
        },
        error: { box: 'border-error/30 bg-error/5 dark:bg-error/10', accent: 'text-error dark:text-dark' }
    };
</script>

<div class={['flex h-full flex-col gap-1 rounded-(--radius-box) border p-4', TONE[tone].box]}>
    <div class="flex items-start justify-between gap-2">
        <p class="text-xs font-semibold opacity-70">{label}</p>
        {#if icon}<span
                aria-hidden="true"
                class={[
                    'flex size-8 shrink-0 items-center justify-center rounded-(--radius-small) bg-current/10',
                    TONE[tone].accent
                ]}>{@render icon()}</span
            >{/if}
    </div>
    <p class={['text-2xl font-black tabular-nums', TONE[tone].accent]}>{value}</p>
    {#if note}<p class="text-xs opacity-60 tabular-nums">{note}</p>{/if}
</div>
