<script lang="ts">
    type Option = { value: string; label: string };

    type Props = {
        label: string;
        name?: string;
        value?: string;
        options: (Option | string)[];
        hint?: string;
        error?: string;
        disabled?: boolean;
    };

    let {
        label,
        name,
        value = $bindable(''),
        options,
        hint = '',
        error = '',
        disabled = false
    }: Props = $props();

    const id = $props.id();
    const normalized = $derived(
        options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
    );
</script>

<div class="flex min-w-0 flex-col gap-1">
    <label for={`${id}-select`} class="text-xs font-semibold text-ink-2">{label}</label>
    <select
        id={`${id}-select`}
        {name}
        bind:value
        {disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        class={[
            'min-h-9 w-full min-w-0 rounded-form border bg-surface-2 px-2.5 text-sm text-ink pointer-coarse:min-h-11',
            'disabled:cursor-not-allowed disabled:opacity-45',
            error ? 'border-error' : 'border-line-strong'
        ]}
    >
        {#each normalized as option (option.value)}
            <option value={option.value}>{option.label}</option>
        {/each}
    </select>
    {#if error}
        <p id={`${id}-error`} class="text-xs text-error">{error}</p>
    {:else if hint}
        <p id={`${id}-hint`} class="text-xs text-muted">{hint}</p>
    {/if}
</div>
