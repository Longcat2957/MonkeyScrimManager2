<script lang="ts">
    import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

    type Props = {
        label: string;
        value?: string;
        type?: HTMLInputTypeAttribute;
        placeholder?: string;
        hint?: string;
        error?: string;
        disabled?: boolean;
        required?: boolean;
        maxlength?: number;
        min?: string | number;
        max?: string | number;
        step?: string | number;
        autocomplete?: HTMLInputAttributes['autocomplete'];
        inputmode?: HTMLInputAttributes['inputmode'];
        oninput?: (value: string) => void;
    };

    let {
        label,
        value = $bindable(''),
        type = 'text',
        placeholder = '',
        hint = '',
        error = '',
        disabled = false,
        required = false,
        maxlength,
        min,
        max,
        step,
        autocomplete,
        inputmode,
        oninput
    }: Props = $props();

    const id = $props.id();
</script>

<div class="flex flex-col gap-1">
    <label for={`${id}-input`} class="text-xs font-semibold text-text-muted">{label}</label>
    <input
        id={`${id}-input`}
        {type}
        bind:value
        {placeholder}
        {disabled}
        {required}
        {maxlength}
        {min}
        {max}
        {step}
        {autocomplete}
        {inputmode}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        class={[
            'min-h-11 w-full rounded-(--radius-form) border bg-bg-surface px-3 text-sm text-text-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hex',
            'disabled:cursor-not-allowed disabled:opacity-45 dark:bg-bg-surface-dark dark:text-text-dark',
            error ? 'border-error' : 'border-brass-line'
        ]}
        oninput={(event) => oninput?.(event.currentTarget.value)}
    />
    {#if error}
        <p id={`${id}-error`} class="text-xs text-error">{error}</p>
    {:else if hint}
        <p id={`${id}-hint`} class="text-xs text-text-muted">{hint}</p>
    {/if}
</div>
