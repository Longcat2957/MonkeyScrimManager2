<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { formatSchedule, formationMethodLabel, SCRIM_STATUS } from '#lib/features/labels.ts';
    import type { ScrimContext } from '#lib/features/scrims/types.ts';
    import { scrimNavItems } from '#lib/components/layout/navigation.ts';
    import type { NavItem } from '#lib/components/layout/navigation.ts';

    type Props = {
        scrim: ScrimContext;
        navigation?: NavItem[];
        headingLevel?: 1 | 2 | 3;
        // 현재 단계 노드 안에 둘 다음 행동.
        action?: Snippet;
        // 제목 줄 오른쪽에 둘 운영 메뉴.
        menu?: Snippet;
        // 현재 단계 아래에 쓸 짧은 사유. 예: 선발 정원 충족
        activeReason?: string;
    };

    let { scrim, navigation, headingLevel = 1, action, menu, activeReason = '' }: Props = $props();

    const status = $derived(SCRIM_STATUS[scrim.status]);
    const items = $derived(
        navigation ?? (page.data.guild ? scrimNavItems(page.data.guild.id, scrim, page.url.pathname) : [])
    );
    const meta = $derived(
        [
            formatSchedule(scrim.scheduledAt),
            `${scrim.teamCount}팀`,
            scrim.canManage && scrim.formationMethod && formationMethodLabel(scrim.formationMethod)
        ].filter((item): item is string => Boolean(item))
    );

    function reason(item: NavItem) {
        if (!item.disabled) return '';
        return item.label === '팀 편성' ? '편성 방식 미정' : '종료 후';
    }
</script>

<header class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <svelte:element this={`h${headingLevel}`} class="text-[1.375rem] font-bold text-balance"
            >{scrim.title}</svelte:element
        >
        <StatusTag text={status.text} state={status.state} />
        <p class="flex flex-wrap items-center gap-x-2 text-[13px] text-text-muted">
            {#each meta as item, index (item)}
                {#if index > 0}<span aria-hidden="true">·</span>{/if}
                <span>{item}</span>
            {/each}
        </p>
        {#if scrim.hardFearless}
            <span
                class="inline-flex items-center rounded-(--radius-small) border border-brass px-2 py-0.5 text-xs font-semibold text-brass"
                >하드 피어리스</span
            >
        {/if}
        {#if menu}
            <div class="ml-auto flex items-center gap-2">{@render menu()}</div>
        {/if}
    </div>

    {#if items.length}
        <!-- 네 단계는 한 상자의 칸으로 이어지고, 현재 칸만 시안 밑줄로 점등된다. -->
        <nav
            aria-label="내전 단계"
            class="grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-box) border border-brass-line bg-brass-line md:grid-cols-[1.5fr_1fr_0.9fr_0.85fr]"
        >
            {#each items as item, index (item.label)}
                {@const base =
                    'flex min-h-14 flex-wrap items-center justify-between gap-2 bg-bg-surface px-3.5 py-2.5 dark:bg-bg-surface-dark'}
                {#if item.static || item.disabled}
                    <span
                        class={[base, 'text-text-muted']}
                        aria-disabled={item.disabled || undefined}
                        aria-current={item.current ? 'page' : undefined}
                    >
                        <span class="flex items-center gap-2">
                            <span
                                class="grid size-[26px] shrink-0 place-items-center rounded-[5px] border border-brass-line font-brand text-sm font-bold"
                                >{index + 1}</span
                            >
                            <span class="flex flex-col">
                                <span class="text-sm font-semibold">{item.label}</span>
                                {#if reason(item)}<span class="text-xs">{reason(item)}</span>{/if}
                            </span>
                        </span>
                    </span>
                {:else if item.current}
                    <div
                        class={[
                            base,
                            'bg-bg-highlight text-text-primary shadow-[inset_0_-2px_0_var(--color-hex)] dark:bg-bg-highlight-dark dark:text-text-dark'
                        ]}
                        aria-current="page"
                    >
                        <span class="flex items-center gap-2">
                            <span
                                class="grid size-[26px] shrink-0 place-items-center rounded-[5px] bg-hex font-brand text-sm font-bold text-hex-ink"
                                >{index + 1}</span
                            >
                            <span class="flex flex-col">
                                <span class="text-sm font-semibold">{item.label}</span>
                                {#if activeReason}
                                    <span class="text-xs text-text-muted">{activeReason}</span>
                                {/if}
                            </span>
                        </span>
                        {#if action}{@render action()}{/if}
                    </div>
                {:else}
                    <a
                        href={item.href}
                        class={[
                            base,
                            'no-underline text-text-muted hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
                        ]}
                    >
                        <span class="flex items-center gap-2">
                            <span
                                class="grid size-[26px] shrink-0 place-items-center rounded-[5px] border border-brass-line font-brand text-sm font-bold"
                                >{index + 1}</span
                            >
                            <span class="text-sm font-semibold">{item.label}</span>
                        </span>
                    </a>
                {/if}
            {/each}
        </nav>
    {/if}
</header>
