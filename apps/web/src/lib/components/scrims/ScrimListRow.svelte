<script lang="ts">
    import AvatarStack from '#lib/components/common/AvatarStack.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import {
        MY_REGISTRATION,
        SCRIM_STATUS,
        formationMethodLabel,
        scheduleParts
    } from '#lib/features/labels.ts';
    import type { ScrimListItem } from '#lib/features/scrims/types.ts';

    let {
        scrim,
        href,
        monthGrouped = false,
        showStatus = true
    }: { scrim: ScrimListItem; href: string; monthGrouped?: boolean; showStatus?: boolean } = $props();

    const status = $derived(SCRIM_STATUS[scrim.status]);
    const schedule = $derived(scrim.scheduledAt ? scheduleParts(scrim.scheduledAt) : null);
    const mine = $derived(scrim.myRegistration ? MY_REGISTRATION[scrim.myRegistration] : undefined);
</script>

<a {href} class="@container block text-ink hover:bg-surface-hover focus-visible:-outline-offset-2">
    <div
        class={[
            'grid min-w-0 items-center gap-x-2.5 px-3 py-3 @min-[36rem]:gap-x-4 @min-[36rem]:px-4',
            showStatus || mine
                ? 'grid-cols-[3.25rem_minmax(0,1fr)_auto] @min-[36rem]:grid-cols-[4.25rem_minmax(0,1fr)_auto_5rem]'
                : 'grid-cols-[3.25rem_minmax(0,1fr)] @min-[36rem]:grid-cols-[4.25rem_minmax(0,1fr)_auto]'
        ]}
    >
        <div class="min-w-0 border-e border-line pe-1 text-xs text-muted">
            {#if schedule && scrim.scheduledAt}
                <time datetime={scrim.scheduledAt} class="flex flex-col gap-1 tabular-nums">
                    <span class="font-brand text-base leading-none font-semibold text-ink-2">
                        <span class:sr-only={monthGrouped}>{schedule.month}/</span>{schedule.day}<span
                            class="sr-only">일</span
                        >
                        {#if monthGrouped}<span class="font-sans text-xs">{schedule.weekday}</span>{/if}
                    </span>
                    <span>{schedule.time}</span>
                </time>
            {:else}
                미정
            {/if}
        </div>
        <div class="min-w-0">
            <span class="block text-sm font-semibold wrap-anywhere">{scrim.title}</span>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {#if schedule && !monthGrouped}<span>{schedule.weekday}</span>{/if}
                {#if scrim.formationMethod}<span>{formationMethodLabel(scrim.formationMethod)}</span>{/if}
                {#if scrim.status === 'recruit'}
                    <span class="tabular-nums">신청 {scrim.registered}/{scrim.capacity}명</span>
                    <span aria-hidden="true" class="h-1 w-12 overflow-hidden rounded-full bg-line">
                        <span
                            class="block h-full bg-nexus"
                            style:width={`${(100 * scrim.registered) / scrim.capacity}%`}
                        ></span>
                    </span>
                {:else}
                    <span>{scrim.teamCount}팀</span>
                {/if}
            </div>
        </div>
        <div class="hidden @min-[36rem]:block">
            <AvatarStack
                people={scrim.members.map((member) => ({
                    key: member.key,
                    name: member.name,
                    imageUrl: member.iconUrl
                }))}
                total={scrim.registered}
            />
        </div>
        {#if showStatus || mine}
            <div class="flex flex-col items-end gap-1">
                {#if showStatus}<StatusTag text={status.text} state={status.state} />{/if}
                {#if mine}
                    <span
                        class={[
                            'text-xs',
                            scrim.myRegistration === 'selected' && 'font-medium text-success',
                            scrim.myRegistration === 'standby' && 'text-info'
                        ]}>{mine}</span
                    >
                {/if}
            </div>
        {/if}
    </div>
</a>
