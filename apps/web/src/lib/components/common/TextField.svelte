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

<div class="flex min-w-0 flex-col gap-1">
    <label for={`${id}-input`} class="text-xs font-semibold text-ink-2">{label}</label>
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
            'min-h-9 w-full min-w-0 rounded-form border bg-surface-2 px-2.5 text-sm text-ink pointer-coarse:min-h-11',
            'disabled:cursor-not-allowed disabled:opacity-45',
            error ? 'border-error' : 'border-line-strong'
        ]}
        oninput={(event) => oninput?.(event.currentTarget.value)}
    />
    {#if error}
        <p id={`${id}-error`} class="text-xs text-error">{error}</p>
    {:else if hint}
        <p id={`${id}-hint`} class="text-xs text-muted">{hint}</p>
    {/if}
</div>
