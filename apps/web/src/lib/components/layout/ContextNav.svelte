<script lang="ts">
    import type { NavItem } from './navigation.ts';

    type Props = {
        items: NavItem[];
        label: string;
        onnavigate?: () => void;
    };

    let { items, label, onnavigate }: Props = $props();
</script>

{#snippet navIcon(label: string)}
    <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
        class="shrink-0 text-nexus"
    >
        {#if label === '서버 홈'}
            <path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-4v-4H8v4H4a1 1 0 0 1-1-1V9.5Z" />
        {:else if label === '내전'}
            <path d="M4 4h5l2 3h5v9H4V4Zm4 6 4 4m0-4-4 4" />
        {:else if label === '경기 기록'}
            <path d="M4 5h12M4 10h12M4 15h8" />
        {:else if label === '통계'}
            <path d="M4 15V9m4 6V5m4 10v-4m4 4V7" />
        {:else if label === '관리'}
            <circle cx="10" cy="10" r="3" />
            <path d="M10 3v2m0 10v2M3 10h2m10 0h2" />
        {:else}
            <circle cx="10" cy="10" r="6" />
        {/if}
    </svg>
{/snippet}

<nav aria-label={label} class="min-h-0 overflow-y-auto">
    <ul class="flex flex-col gap-1">
        {#each items as item (item.label)}
            {@const itemClass = [
                'flex min-h-9.5 w-full items-center gap-2.5 rounded-form border px-2.5 text-sm no-underline focus-visible:-outline-offset-2 pointer-coarse:min-h-11',
                item.current
                    ? 'border-nexus bg-selected font-bold text-ink'
                    : 'border-transparent font-medium text-muted hover:bg-surface-hover hover:text-ink',
                item.disabled && 'opacity-50'
            ]}
            <li>
                {#if item.static || item.disabled}
                    <span
                        class={itemClass}
                        aria-current={item.current ? 'page' : undefined}
                        aria-disabled={item.disabled || undefined}
                    >
                        {@render navIcon(item.label)}
                        {item.label}
                    </span>
                {:else}
                    <a
                        href={item.href}
                        aria-current={item.current ? 'page' : undefined}
                        onclick={onnavigate}
                        class={itemClass}
                    >
                        {@render navIcon(item.label)}
                        {item.label}
                    </a>
                {/if}
            </li>
        {/each}
    </ul>
</nav>
