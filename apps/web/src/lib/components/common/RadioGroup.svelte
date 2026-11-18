<script lang="ts">
    type Option = { value: string; label: string; hint?: string };

    type Props = {
        legend: string;
        value?: string;
        name: string;
        options: Option[];
        disabled?: boolean;
        error?: string;
    };

    let { legend, value = $bindable(''), name, options, disabled = false, error = '' }: Props = $props();
    const id = $props.id();
</script>

<fieldset class="flex min-w-0 flex-col gap-1" aria-describedby={error ? `${id}-error` : undefined}>
    <legend class="mb-1 text-xs font-semibold text-ink-2">{legend}</legend>
    {#each options as option (option.value)}
        <label class="inline-flex min-h-6 items-center gap-2 text-ui pointer-coarse:min-h-11">
            <input
                type="radio"
                {name}
                value={option.value}
                bind:group={value}
                {disabled}
                class="size-4 shrink-0 accent-nexus disabled:opacity-45"
            />
            <span class="flex flex-col gap-0.5">
                <span class="font-medium">{option.label}</span>
                {#if option.hint}<span class="text-xs text-muted">{option.hint}</span>{/if}
            </span>
        </label>
    {/each}
    {#if error}<p id={`${id}-error`} class="text-xs text-error">{error}</p>{/if}
</fieldset>
