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

<label class="inline-flex min-h-6 items-center gap-2 text-ui pointer-coarse:min-h-11">
    <input
        id={`${id}-check`}
        type="checkbox"
        bind:checked
        {disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        class="size-4 shrink-0 accent-nexus disabled:opacity-45"
        onchange={() => onchange?.(checked)}
    />
    <span class="flex flex-col gap-0.5">
        <span class="font-medium">{label}</span>
        {#if hint}<span id={`${id}-hint`} class="text-xs text-muted">{hint}</span>{/if}
    </span>
</label>
