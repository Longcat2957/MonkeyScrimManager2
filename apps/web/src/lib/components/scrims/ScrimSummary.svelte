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

    function reflectEdge(event: PointerEvent & { currentTarget: HTMLAnchorElement }) {
        if (event.pointerType !== 'mouse') return;
        const link = event.currentTarget;
        const { left, top, width, height } = link.getBoundingClientRect();
        let x = event.clientX - left;
        let y = event.clientY - top;
        const side = Math.min(x, width - x) < Math.min(y, height - y);
        if (side) x = x < width / 2 ? 0 : width;
        else y = y < height / 2 ? 0 : height;
        link.style.setProperty('--reflection', `${side ? '3px 28px' : '54px 3px'} at ${x}px ${y}px`);
    }
</script>

{#snippet stepLabel(item: NavItem, number: number, hint: string)}
    <span class="flex min-w-0 items-center gap-2">
        <span
            class={[
                'grid size-[26px] shrink-0 place-items-center rounded-[5px] border font-brand text-base font-bold',
                item.current ? 'border-nexus bg-nexus text-nexus-ink' : 'border-line-strong text-muted'
            ]}>{number}</span
        >
        <span class="flex min-w-0 flex-col">
            <strong class="text-sm">{item.label}</strong>
            {#if hint}<span class="text-micro text-muted">{hint}</span>{/if}
        </span>
    </span>
{/snippet}

<header
    data-scrim={scrim.id}
    data-scrim-stage={items.findIndex((item) => item.current)}
    class={['flex min-w-0 flex-col gap-3', !action && 'mb-4']}
>
    <div class="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <svelte:element
            this={`h${headingLevel}`}
            class="min-w-0 self-start text-title font-bold tracking-[-0.02em] text-balance"
            >{scrim.title}</svelte:element
        >
        <StatusTag text={status.text} state={status.state} />
        <p class="flex flex-wrap items-center gap-x-2 text-ui text-muted">
            {#each meta as item, index (item)}
                {#if index > 0}<span aria-hidden="true">·</span>{/if}
                <span>{item}</span>
            {/each}
        </p>
        {#if scrim.hardFearless}
            <span
                class="inline-flex items-center rounded-(--radius-small) border border-role-gold px-2 py-0.5 text-xs font-semibold text-role-gold"
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
            class="grid grid-cols-2 gap-px overflow-hidden rounded-box border border-line bg-line md:grid-cols-[1.45fr_1fr_0.9fr_0.85fr]"
        >
            {#each items as item, index (item.label)}
                {@const base =
                    'relative flex min-h-[54px] min-w-0 flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 sm:px-3.5'}
                {#if item.static || item.disabled}
                    <span
                        class={[base, 'bg-surface text-muted']}
                        aria-disabled={item.disabled || undefined}
                        aria-current={item.current ? 'page' : undefined}
                    >
                        {@render stepLabel(item, index + 1, reason(item))}
                    </span>
                {:else if item.current}
                    <div class={[base, 'bg-selected text-ink']} aria-current="page">
                        <span aria-hidden="true" class="phase-line absolute inset-x-0 bottom-0 h-0.5 bg-nexus"
                        ></span>
                        {@render stepLabel(item, index + 1, activeReason)}
                        {#if action}{@render action()}{/if}
                    </div>
                {:else}
                    <a
                        href={item.href}
                        onpointermove={reflectEdge}
                        onpointerleave={(event) => event.currentTarget.style.removeProperty('--reflection')}
                        class={[
                            base,
                            'phase-link bg-surface text-ink-2 no-underline focus-visible:-outline-offset-2'
                        ]}
                    >
                        {@render stepLabel(item, index + 1, '')}
                    </a>
                {/if}
            {/each}
        </nav>
    {/if}
</header>

<style>
    @media (prefers-reduced-motion: no-preference) {
        .phase-link::after {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            background: radial-gradient(
                ellipse var(--reflection, 0px 0px at 0 0),
                var(--color-nexus),
                transparent
            );
        }
    }
</style>
