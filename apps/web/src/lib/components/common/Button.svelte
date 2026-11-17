<script lang="ts">
    import type { Snippet } from 'svelte';

    type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

    type Props = {
        // 새 코드는 variant를 쓴다. 이전 STDF 호출부의 fill 이름도 같은 모양으로 매핑한다.
        variant?: Variant;
        fill?: string;
        size?: 'sm' | 'md' | 'lg' | 'auto' | 'full';
        type?: 'button' | 'submit' | 'reset';
        href?: string;
        disabled?: boolean;
        loading?: boolean;
        injClass?: string;
        ariaLabel?: string;
        onclick?: (event: MouseEvent) => void;
        children: Snippet;
    };

    let {
        variant,
        fill = 'lineLight',
        size = 'md',
        type = 'button',
        href,
        disabled = false,
        loading = false,
        injClass = '',
        ariaLabel,
        onclick,
        children
    }: Props = $props();

    const FILL_VARIANT: Record<string, Variant> = {
        text: 'quiet',
        none: 'quiet',
        transparent: 'quiet',
        currentColor: 'quiet',
        textState: 'quiet',
        lineLight: 'secondary',
        light: 'secondary',
        base: 'secondary'
    };

    const KIND = $derived<Variant>(variant ?? FILL_VARIANT[fill] ?? 'secondary');
    const SIZE = {
        sm: 'min-h-9 px-3 text-xs',
        md: 'min-h-11 px-4 text-sm',
        lg: 'min-h-12 px-5 text-base',
        auto: 'min-h-11 px-4 text-sm',
        full: 'min-h-11 w-full px-4 text-sm'
    } as const;

    // 채움 버튼은 45° 모따기, 보조·조용한 버튼은 황동 1px 테두리를 쓴다.
    const KIND_CLASS: Record<Variant, string> = {
        primary: 'rounded-(--radius-form) bg-hex text-hex-ink hover:bg-hex-hover font-semibold',
        secondary:
            'rounded-(--radius-form) border border-brass-line bg-bg-surface text-text-primary hover:bg-bg-highlight dark:bg-bg-surface-dark dark:text-text-dark dark:hover:bg-bg-highlight-dark',
        quiet: 'rounded-(--radius-form) text-text-muted hover:bg-bg-highlight hover:text-text-primary dark:hover:bg-bg-highlight-dark dark:hover:text-text-dark',
        danger: 'rounded-(--radius-form) border border-error/60 bg-error/10 text-error hover:bg-error/20 font-semibold'
    };

    const CLASS = $derived([
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hex',
        'disabled:cursor-not-allowed disabled:opacity-45',
        loading && 'cursor-wait opacity-70',
        SIZE[size],
        KIND_CLASS[KIND],
        injClass
    ]);
</script>

{#if href && !disabled}
    <a class={CLASS} {href} aria-label={ariaLabel}>{@render children()}</a>
{:else}
    <button
        {type}
        class={CLASS}
        disabled={disabled || loading}
        aria-label={ariaLabel}
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
