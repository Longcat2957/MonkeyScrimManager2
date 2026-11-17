<script lang="ts">
    type Props = {
        label: string;
        checked?: boolean;
        disabled?: boolean;
        hint?: string;
        onchange?: (checked: boolean) => void;
    };

    let { label, checked = $bindable(false), disabled = false, hint = '', onchange }: Props = $props();
    const id = $props.id();
</script>

<label class="flex items-start gap-2 text-sm">
    <input
        id={`${id}-check`}
        type="checkbox"
        bind:checked
        {disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        class="mt-0.5 size-4 shrink-0 accent-[var(--color-hex)] disabled:opacity-45"
        onchange={() => onchange?.(checked)}
    />
    <span class="flex flex-col gap-0.5">
        <span class="font-medium">{label}</span>
        {#if hint}<span id={`${id}-hint`} class="text-xs text-text-muted">{hint}</span>{/if}
    </span>
</label>
