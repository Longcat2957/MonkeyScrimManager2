<script lang="ts">
    import type { Snippet } from 'svelte';

    type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

    type Props = {
        variant?: Variant;
        size?: 'sm' | 'md' | 'lg';
        type?: 'button' | 'submit' | 'reset';
        href?: string;
        disabled?: boolean;
        loading?: boolean;
        class?: string;
        ariaLabel?: string;
        'aria-expanded'?: boolean;
        'aria-controls'?: string;
        'aria-haspopup'?: 'menu';
        onclick?: (event: MouseEvent) => void;
        children: Snippet;
    };

    let {
        variant = 'secondary',
        size = 'md',
        type = 'button',
        href,
        disabled = false,
        loading = false,
        class: className = '',
        ariaLabel,
        'aria-expanded': expanded,
        'aria-controls': controls,
        'aria-haspopup': haspopup,
        onclick,
        children
    }: Props = $props();

    const SIZE = {
        sm: 'min-h-8 px-2.5 text-xs',
        md: 'min-h-9 px-3 text-ui',
        lg: 'min-h-11 px-4 text-sm'
    } as const;

    const KIND_CLASS: Record<Variant, string> = {
        primary: 'bg-nexus text-nexus-ink hover:bg-nexus-hover',
        secondary: 'border border-line-strong bg-surface-2 text-ink hover:bg-surface-hover',
        quiet: 'text-ink-2 hover:bg-surface-hover hover:text-ink',
        danger: 'border border-error bg-error/10 text-error hover:bg-error/20'
    };

    const CLASS = $derived([
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-form font-semibold transition-colors pointer-coarse:min-h-11',
        'disabled:cursor-not-allowed disabled:opacity-45',
        loading && 'cursor-wait opacity-70',
        SIZE[size],
        KIND_CLASS[variant],
        className
    ]);
</script>

{#if href && !disabled && !loading}
    <a class={CLASS} {href} aria-label={ariaLabel}>{@render children()}</a>
{:else}
    <button
        {type}
        class={CLASS}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-haspopup={haspopup}
        aria-busy={loading}
        {onclick}
    >
        {#if loading}<span
                class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
            ></span>{/if}
        {@render children()}
    </button>
{/if}
