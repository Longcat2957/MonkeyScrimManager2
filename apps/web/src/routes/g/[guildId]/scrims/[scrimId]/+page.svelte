<script lang="ts">
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import FormationMethodChooser from '#lib/components/scrims/FormationMethodChooser.svelte';
    import MyRegistrationBar from '#lib/components/scrims/MyRegistrationBar.svelte';
    import ParticipantBoard from '#lib/components/scrims/ParticipantBoard.svelte';
    import ScrimOperationsBar from '#lib/components/scrims/ScrimOperationsBar.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    // 끝난 내전에는 내 신청 줄을 두지 않는다. 운영자는 종료 재개와 취소 복구를 같은 운영 메뉴에서 찾는다.
    const showRegistration = $derived(!data.finished && data.me !== null);
    const showOperations = $derived(data.can.manage && data.settings !== null);
    // 팀 편성을 확정하기 전(모집 중·편성 중)에는 운영자가 여기서 편성 방식을 고르거나 바꾼다.
    const choosingMethod = $derived(data.can.manage && ['recruit', 'preparing'].includes(data.scrim.status));
</script>

<svelte:head>
    <title>{data.scrim.title} · 내전 요약 | {SERVICE_NAME}</title>
</svelte:head>

{#snippet participants()}
    <ParticipantBoard
        guildId={page.params.guildId!}
        participants={data.participants}
        counts={data.counts}
        manager={data.can.manage}
        canSelect={data.can.select}
    />
{/snippet}

<!-- 운영자는 단계 조작·참가자 관리를 먼저, 참가자는 내 신청을 먼저 읽는다. -->
<div class="flex flex-col gap-6">
    {#if showOperations && data.settings}
        <div class="rounded-(--radius-box) border border-border bg-bg-surface dark:bg-bg-surface-dark">
            <ScrimOperationsBar
                nextAction={data.can.nextAction}
                revert={data.can.revert}
                restore={data.can.restore}
                endEarly={data.can.endEarly}
                cancellable={['recruit', 'preparing', 'ready'].includes(data.scrim.status)}
                settings={data.settings}
                editable={data.editable}
                notifyParticipants={data.can.notifyParticipants}
                notifications={data.notifications}
            />
        </div>
    {/if}

    {#if data.can.manage}
        {@render participants()}
    {/if}

    {#if showRegistration || choosingMethod}
        <div
            class="divide-y divide-text-primary/5 rounded-(--radius-box) border border-border bg-bg-surface dark:divide-text-dark/5 dark:bg-bg-surface-dark"
        >
            {#if showRegistration && data.me}
                <MyRegistrationBar
                    registration={data.me.registration}
                    accounts={data.me.riotAccounts}
                    primaryAccountId={data.me.primaryAccountId}
                    canRegister={data.can.register}
                    canEdit={data.can.editRegistration}
                    blockedReason={data.can.registerBlockedReason}
                />
            {/if}
            {#if choosingMethod}
                <FormationMethodChooser method={data.scrim.formationMethod} status={data.scrim.status} />
            {/if}
        </div>
    {/if}

    {#if !data.can.manage}
        {@render participants()}
    {/if}
</div>
