<script lang="ts">
    import type { NavItem } from './navigation.ts';

    type Props = {
        items: NavItem[];
        label: string;
        vertical?: boolean;
        onnavigate?: () => void;
        // crown: 상단 크라운 바, rail: 좌측 서버 레일, default: 시트·본문
        tone?: 'default' | 'crown' | 'rail';
    };

    let { items, label, vertical = false, onnavigate, tone = 'default' }: Props = $props();
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
        class="shrink-0"
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

<nav aria-label={label}>
    <ul
        class={[
            'flex',
            vertical ? 'flex-col gap-1' : 'flex-wrap items-center gap-1',
            tone === 'rail' && 'w-full'
        ]}
    >
        {#each items as item (item.label)}
            {@const itemClass = [
                'flex min-h-11 items-center text-sm font-semibold no-underline',
                tone === 'rail'
                    ? [
                          'w-full gap-2 rounded-(--radius-form) border border-transparent px-3',
                          item.current
                              ? 'border-hex/40 bg-hex/10 text-hex'
                              : 'text-text-muted hover:bg-bg-highlight hover:text-text-primary dark:hover:bg-bg-highlight-dark dark:hover:text-text-dark'
                      ]
                    : tone === 'crown'
                      ? [
                            'border-b-2 px-3',
                            item.current
                                ? 'border-hex text-hex'
                                : 'border-transparent text-text-muted hover:text-text-primary dark:hover:text-text-dark'
                        ]
                      : [
                            'rounded-(--radius-form) px-3',
                            item.current
                                ? 'bg-hex/10 text-hex'
                                : 'text-text-muted hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
                        ],
                item.disabled && 'opacity-50',
                vertical && 'w-full'
            ]}
            <li class={tone === 'rail' ? 'w-full' : undefined}>
                {#if item.static || item.disabled}
                    <span
                        class={itemClass}
                        aria-current={item.current ? 'page' : undefined}
                        aria-disabled={item.disabled || undefined}
                    >
                        {#if tone === 'rail'}{@render navIcon(item.label)}{/if}
                        {item.label}
                    </span>
                {:else}
                    <a
                        href={item.href}
                        aria-current={item.current ? 'page' : undefined}
                        onclick={onnavigate}
                        class={itemClass}
                    >
                        {#if tone === 'rail'}{@render navIcon(item.label)}{/if}
                        {item.label}
                    </a>
                {/if}
            </li>
        {/each}
    </ul>
</nav>
