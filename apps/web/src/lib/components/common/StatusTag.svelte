<script lang="ts">
    import type { StatusState } from '#lib/ui/status.ts';

    // 상태 라벨은 색과 함께 문구를 항상 보여 준다. 색만으로 의미를 전달하지 않는다.
    let { text, state = 'neutral' }: { text: string; state?: StatusState } = $props();

    const STATE: Record<StatusState, string> = {
        theme: 'border-hex/60 bg-hex/10 text-hex',
        success: 'border-success/50 bg-success/10 text-success',
        warning: 'border-warning/50 bg-warning/10 text-warning',
        error: 'border-error/50 bg-error/10 text-error',
        info: 'border-info/50 bg-info/10 text-info',
        neutral: 'border-brass-line bg-bg-highlight text-text-muted dark:bg-bg-highlight-dark'
    };
</script>

<span
    class={[
        'inline-flex min-h-6 items-center whitespace-nowrap rounded-(--radius-small) border px-2 py-0.5 text-xs leading-tight font-semibold',
        STATE[state]
    ]}>{text}</span
>
