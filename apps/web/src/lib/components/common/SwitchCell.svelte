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
<button
    type="button"
    role="switch"
    aria-checked={active}
    aria-labelledby={`${id}-title`}
    aria-describedby={subTitle ? `${id}-description` : undefined}
    {disabled}
    onclick={toggle}
    class={[
        'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45',
        line && 'border-b border-line'
    ]}
>
    {#if leftChild}<span class="shrink-0">{@render leftChild()}</span>{/if}
    <span class="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-title`} class="text-ui font-semibold text-ink">{title}</span>
        {#if subTitle}
            <span id={`${id}-description`} class="text-xs text-muted">{subTitle}</span>
        {/if}
    </span>
    <span
        aria-hidden="true"
        class={[
            'inline-flex h-6 w-11 shrink-0 items-center rounded-full border motion-safe:transition-colors',
            active ? 'border-nexus bg-nexus' : 'border-line-strong bg-surface-2'
        ]}
    >
        <span
            class={[
                'size-4 rounded-full motion-safe:transition-transform',
                active ? 'translate-x-5 bg-nexus-ink' : 'translate-x-1 bg-muted'
            ]}
        ></span>
    </span>
</button>
