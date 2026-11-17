<script lang="ts">
    type Option = { value: string; label: string };

    type Props = {
        label: string;
        value?: string;
        options: (Option | string)[];
        hint?: string;
        error?: string;
        disabled?: boolean;
    };

    let { label, value = $bindable(''), options, hint = '', error = '', disabled = false }: Props = $props();

    const id = $props.id();
    const normalized = $derived(
        options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
    );
</script>

<div class="flex flex-col gap-1">
    <label for={`${id}-select`} class="text-xs font-semibold text-text-muted">{label}</label>
    <select
        id={`${id}-select`}
        bind:value
        {disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        class={[
            'min-h-11 w-full rounded-(--radius-form) border bg-bg-surface px-3 text-sm text-text-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hex',
            'disabled:cursor-not-allowed disabled:opacity-45 dark:bg-bg-surface-dark dark:text-text-dark',
            error ? 'border-error' : 'border-brass-line'
        ]}
    >
        {#each normalized as option (option.value)}
            <option value={option.value}>{option.label}</option>
        {/each}
    </select>
    {#if error}
        <p id={`${id}-error`} class="text-xs text-error">{error}</p>
    {:else if hint}
        <p id={`${id}-hint`} class="text-xs text-text-muted">{hint}</p>
    {/if}
</div>
