<script lang="ts">
    import type { StatusState } from '#lib/ui/status.ts';

    // 상태 라벨은 색과 함께 문구를 항상 보여 준다. 색만으로 의미를 전달하지 않는다.
    let { text, state = 'neutral' }: { text: string; state?: StatusState } = $props();

    const STATE: Record<StatusState, string> = {
        theme: 'border-nexus bg-selected text-nexus',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        error: 'border-transparent bg-error/15 text-error',
        info: 'border-transparent bg-info/15 text-info',
        neutral: 'border-line bg-surface-2 text-muted'
    };
</script>

<span
    class={[
        'inline-flex min-h-5.5 items-center whitespace-nowrap rounded-(--radius-small) border px-2 text-xs leading-tight font-semibold',
        STATE[state]
    ]}>{text}</span
>
