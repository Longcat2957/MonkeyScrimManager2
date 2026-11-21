<script lang="ts">
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import FormationMethodChooser from '#lib/components/scrims/FormationMethodChooser.svelte';
    import LaneMatrix from '#lib/components/scrims/LaneMatrix.svelte';
    import MyRegistrationBar from '#lib/components/scrims/MyRegistrationBar.svelte';
    import ParticipantBoard from '#lib/components/scrims/ParticipantBoard.svelte';
    import ScrimAdvanceButton from '#lib/components/scrims/ScrimAdvanceButton.svelte';
    import ScrimNotifications from '#lib/components/scrims/ScrimNotifications.svelte';
    import ScrimOperationsBar from '#lib/components/scrims/ScrimOperationsBar.svelte';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    // 끝난 내전에는 내 신청 줄을 두지 않는다.
    const showRegistration = $derived(!data.finished && data.me !== null);
    const showOperations = $derived(Boolean(data.can.manage && data.settings));
    // 팀 편성을 확정하기 전(모집 중·편성 중)에는 운영자가 여기서 편성 방식을 고른다.
    const choosingMethod = $derived(
        Boolean(data.can.manage && ['recruit', 'preparing'].includes(data.scrim.status))
    );

    // 선발된 선수의 1순위·부포지션 분포를 팀 수와 비교한다.
    const laneCounts = $derived.by(() => {
        const base = {
            top: { primary: 0, secondary: 0 },
            jungle: { primary: 0, secondary: 0 },
            mid: { primary: 0, secondary: 0 },
            bot: { primary: 0, secondary: 0 },
            support: { primary: 0, secondary: 0 }
        } satisfies Record<LolPosition, { primary: number; secondary: number }>;
        for (const player of data.participants) {
            if (player.status !== 'selected') continue;
            player.positions.forEach((position, index) => {
                if (index === 0) base[position].primary += 1;
                else base[position].secondary += 1;
            });
        }
        return base;
    });
</script>

<svelte:head>
    <title>{data.scrim.title} · 내전 요약 | {SERVICE_NAME}</title>
</svelte:head>

{#snippet advance()}
    <ScrimAdvanceButton nextAction={data.can.nextAction} />
{/snippet}

{#snippet operations()}
    {#if showOperations && data.settings}
        <ScrimOperationsBar
            revert={data.can.revert}
            readyMethod={data.scrim.status === 'ready' ? data.scrim.formationMethod : null}
            restore={data.can.restore}
            endEarly={data.can.endEarly}
            cancellable={['recruit', 'preparing', 'ready', 'in_progress'].includes(data.scrim.status)}
            cancelGameCount={data.can.cancelGameCount}
            settings={data.settings}
            editable={data.editable}
            notifyParticipants={data.can.notifyParticipants}
        />
    {/if}
{/snippet}

<ScrimSummary
    scrim={data.scrim}
    action={advance}
    menu={operations}
    activeReason={data.scrim.status === 'recruit' && data.counts.selected >= data.counts.playCapacity
        ? '선발 정원 충족'
        : ''}
/>

{#if showOperations}
    <ScrimNotifications notifications={data.notifications} />
{/if}

<div
    data-scrim-board
    class={[
        'mt-3 grid min-w-0 items-start gap-x-4 gap-y-2.5',
        (choosingMethod || showRegistration) && 'xl:grid-cols-[minmax(0,1fr)_21rem] xl:grid-rows-[auto_1fr]'
    ]}
>
    <LaneMatrix counts={laneCounts} required={data.scrim.teamCount} />
    {#if choosingMethod || showRegistration}
        <aside
            class="grid min-w-0 gap-3 sm:grid-cols-2 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:grid-cols-1"
            aria-label="내전 신청 및 편성"
        >
            {#if choosingMethod}
                <FormationMethodChooser method={data.scrim.formationMethod} status={data.scrim.status} />
            {/if}
            {#if showRegistration && data.me}
                <MyRegistrationBar
                    registration={data.me.registration}
                    accounts={data.me.riotAccounts}
                    primaryAccountId={data.me.primaryAccountId}
                    previousPositions={data.me.previousPositions}
                    canRegister={data.can.register}
                    canEdit={data.can.editRegistration}
                    blockedReason={data.can.registerBlockedReason}
                />
            {/if}
        </aside>
    {/if}
    <ParticipantBoard
        guildId={page.params.guildId!}
        participants={data.participants}
        counts={data.counts}
        manager={data.can.manage}
        canSelect={data.can.select}
    />
</div>
