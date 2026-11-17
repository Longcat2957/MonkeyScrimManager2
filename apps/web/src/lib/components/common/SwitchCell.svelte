<script lang="ts">
    import type { Snippet } from 'svelte';

    type Props = {
        title: string;
        subTitle?: string;
        active: boolean;
        disabled?: boolean;
        line?: boolean;
        leftChild?: Snippet;
        onchange?: (active: boolean) => void;
    };

    let {
        title,
        subTitle = '',
        active = $bindable(),
        disabled = false,
        line = false,
        leftChild,
        onchange
    }: Props = $props();
    const id = $props.id();

    function toggle() {
        if (disabled) return;
        active = !active;
        onchange?.(active);
    }
</script>

<!-- 행 전체가 하나의 스위치 버튼이다. 별도 내부 버튼을 두지 않아 중첩 조작이 생기지 않는다. -->
<div
    class={['flex w-full items-center justify-between gap-4 px-3 py-3', line && 'border-b border-brass-line']}
>
    {#if leftChild}<span class="shrink-0">{@render leftChild()}</span>{/if}
    <span class="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-title`} class="font-medium">{title}</span>
        {#if subTitle}
            <span id={`${id}-description`} class="text-xs text-text-muted">{subTitle}</span>
        {/if}
    </span>
    <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-labelledby={`${id}-title`}
        aria-describedby={subTitle ? `${id}-description` : undefined}
        {disabled}
        onclick={toggle}
        class={[
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
            active ? 'border-hex bg-hex/70' : 'border-brass-line bg-bg-highlight dark:bg-bg-highlight-dark',
            disabled && 'cursor-not-allowed opacity-45'
        ]}
    >
        <span
            class={[
                'size-4 rounded-full transition-transform',
                active ? 'translate-x-5 bg-hex-ink' : 'translate-x-1 bg-text-muted'
            ]}
        ></span>
    </button>
</div>
