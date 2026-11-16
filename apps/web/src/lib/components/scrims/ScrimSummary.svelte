<script lang="ts">
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import ContextNav from '#lib/components/layout/ContextNav.svelte';
    import type { NavItem } from '#lib/components/layout/navigation.ts';
    import { formatSchedule, formationMethodLabel, SCRIM_STATUS } from '#lib/features/labels.ts';
    import type { ScrimContext } from '#lib/features/scrims/types.ts';

    let {
        scrim,
        navigation = [],
        headingLevel = 1
    }: {
        scrim: ScrimContext;
        navigation?: NavItem[];
        headingLevel?: 1 | 2 | 3;
    } = $props();

    const status = $derived(SCRIM_STATUS[scrim.status]);
    const meta = $derived(
        [
            formatSchedule(scrim.scheduledAt),
            `${scrim.teamCount}팀`,
            scrim.canManage && scrim.formationMethod && formationMethodLabel(scrim.formationMethod),
            scrim.hardFearless ? '하드 피어리스' : null
        ].filter((item): item is string => Boolean(item))
    );
</script>

<header class="mb-6 flex flex-col gap-3 border-b border-border pb-3">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <svelte:element this={`h${headingLevel}`} class="text-xl font-bold text-balance md:text-2xl"
            >{scrim.title}</svelte:element
        >
        <StatusTag text={status.text} state={status.state} />
    </div>
    <p class="text-sm text-text-muted">{meta.join(' · ')}</p>
    {#if navigation.length}
        <ContextNav items={navigation} label="내전 메뉴" />
    {/if}
</header>
