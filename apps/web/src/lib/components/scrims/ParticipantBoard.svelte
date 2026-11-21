<script lang="ts">
    import { tick } from 'svelte';
    import { resolve } from '$app/paths';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { REGISTRATION_STATUS } from '#lib/features/labels.ts';
    import type {
        RegistrationStatus,
        ScrimParticipant,
        ScrimRegistrationCounts
    } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { markChange } from '#lib/ui/mark-change.svelte.ts';
    import { toast } from '#lib/ui/toast.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';
    import ManualRegistrationDialog from './ManualRegistrationDialog.svelte';
    import PositionChips from './PositionChips.svelte';

    type Props = {
        guildId: string;
        participants: ScrimParticipant[];
        counts: ScrimRegistrationCounts;
        manager: boolean;
        canSelect: boolean;
    };

    let { guildId, participants, counts, manager, canSelect }: Props = $props();

    const ACTIVE: RegistrationStatus[] = ['selected', 'standby'];
    const FILTERS: { text: string; statuses: RegistrationStatus[] }[] = [
        { text: '전체', statuses: ACTIVE },
        { text: '선발', statuses: ['selected'] },
        { text: '대기', statuses: ['standby'] },
        { text: '철회·제외', statuses: ['withdrawn', 'excluded'] }
    ];

    let filter = $state(0);
    let managing = $state(false);
    let selected = $state<string[]>([]);
    let pending = $state(false);
    let adding = $state(false);
    let controls = $state<HTMLElement>();

    const active = $derived(counts.selected + counts.standby);
    const labels = $derived(
        FILTERS.map(({ text, statuses }) =>
            desktop.current ? `${text} ${statuses.reduce((sum, status) => sum + counts[status], 0)}` : text
        )
    );
    const shown = $derived.by(() => {
        const statuses = managing ? ACTIVE : FILTERS[filter]!.statuses;
        return participants.filter((participant) => statuses.includes(participant.status));
    });

    function toggle(id: string) {
        selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    }

    async function apply(ids: string[], status: 'selected' | 'standby' | 'excluded') {
        if (pending || ids.length === 0) return;
        if (
            status === 'excluded' &&
            !(await confirm(
                `${ids.length}명을 제외할까요? 제외한 신청은 되돌릴 수 없고, 빈 선발 자리는 먼저 신청한 대기자가 채워요.`,
                '참가자 제외'
            ))
        )
            return;
        pending = true;
        try {
            const message = await postAction('participants', { ids: ids.join(','), status });
            if (message) toast.error(message);
            else selected = selected.filter((id) => !ids.includes(id));
        } finally {
            pending = false;
            await tick();
            controls
                ?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)')
                ?.focus({ preventScroll: true });
        }
    }
</script>

<section class="panel min-w-0 overflow-hidden" aria-labelledby="participants" aria-busy={pending}>
    <div class="panel-bar justify-start gap-x-2.5 px-3.5 py-2">
        <div class="flex flex-wrap items-center gap-1.5">
            <h2 id="participants" class="mr-1 text-base font-bold">참가자</h2>
            <span
                class="rounded-(--radius-small) border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted"
                >신청 {active}/{counts.activeCapacity}명</span
            >
            {#if manager}
                <span
                    class="rounded-(--radius-small) border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted"
                    >선발 {counts.selected}/{counts.playCapacity}명</span
                >
            {/if}
            {#if pending}<Spinner label="선발 상태를 저장하는 중" />{/if}
        </div>

        {#if participants.length && !managing}
            <div role="group" aria-label="상태 필터" class="max-w-full min-w-0">
                <SelectionTabs {labels} bind:active={filter} />
            </div>
        {/if}

        {#if canSelect && !managing}
            <div class="ml-auto flex flex-wrap gap-1.5">
                <Button
                    variant="secondary"
                    disabled={active >= counts.activeCapacity}
                    onclick={() => (adding = true)}
                >
                    참가자 추가
                </Button>
                <Button variant="secondary" disabled={active === 0} onclick={() => (managing = true)}>
                    선발 관리
                </Button>
            </div>
        {/if}
    </div>

    {#if managing}
        <div class="panel-bar bg-selected">
            <span class="text-sm font-semibold">선택 {selected.length}명</span>
            <div class="flex flex-wrap gap-2">
                <Button
                    variant="primary"
                    size="sm"
                    disabled={!selected.length || pending}
                    onclick={() => apply(selected, 'selected')}
                >
                    선발
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={!selected.length || pending}
                    onclick={() => apply(selected, 'standby')}
                >
                    대기
                </Button>
                <Button
                    variant="danger"
                    size="sm"
                    disabled={!selected.length || pending}
                    onclick={() => apply(selected, 'excluded')}
                >
                    제외
                </Button>
                <Button variant="quiet" size="sm" disabled={pending} onclick={() => (managing = false)}
                    >완료</Button
                >
            </div>
        </div>
    {/if}

    <div bind:this={controls} class="overflow-x-auto">
        {#if participants.length === 0}
            <p class="px-4 py-10 text-center text-sm text-muted">아직 신청한 사람이 없어요</p>
        {:else if shown.length === 0}
            <p class="px-4 py-10 text-center text-sm text-muted">해당하는 참가자가 없어요</p>
        {:else}
            <table
                class="data-table table-fixed sm:[&_td]:px-3.5 sm:[&_th]:px-3.5 [&_th]:py-1.5"
                aria-labelledby="participants"
            >
                <thead>
                    <tr>
                        {#if managing}<th scope="col" class="w-11"><span class="sr-only">선택</span></th>{/if}
                        <th scope="col">참가자</th>
                        <th scope="col" class="w-[38%] sm:w-[13.75rem]">희망 포지션</th>
                        <th scope="col" class="w-16 text-right sm:w-[5.75rem]">상태</th>
                    </tr>
                </thead>
                <tbody>
                    {#each shown as participant (participant.registrationId)}
                        {@const tag = REGISTRATION_STATUS[participant.status]}
                        <tr
                            class={managing && selected.includes(participant.registrationId)
                                ? 'bg-selected'
                                : undefined}
                        >
                            {#if managing}
                                <td class="!p-0">
                                    <label class="grid min-h-11 cursor-pointer place-items-center">
                                        <input
                                            type="checkbox"
                                            class="size-4 cursor-pointer accent-[var(--color-nexus)] disabled:cursor-not-allowed"
                                            checked={selected.includes(participant.registrationId)}
                                            disabled={pending}
                                            aria-label={`${participant.displayName} 선택`}
                                            onchange={() => toggle(participant.registrationId)}
                                        />
                                    </label>
                                </td>
                            {/if}
                            <td>
                                <span class="flex min-w-0 items-center gap-2.5">
                                    <PlayerFace
                                        name={participant.displayName}
                                        imageUrl={participant.iconUrl}
                                        size="sm"
                                    />
                                    <span
                                        class="flex min-w-0 flex-col gap-x-4 sm:flex-row sm:flex-wrap sm:items-baseline"
                                    >
                                        {#if participant.userId && !managing}
                                            <a
                                                href={resolve('/g/[guildId]/players/[userId]', {
                                                    guildId,
                                                    userId: participant.userId
                                                })}
                                                class="min-w-0 font-semibold wrap-anywhere hover:underline"
                                                >{participant.displayName}</a
                                            >
                                        {:else}
                                            <span class="min-w-0 font-semibold wrap-anywhere"
                                                >{participant.displayName}</span
                                            >
                                        {/if}
                                        {#if participant.riotId}
                                            <span class="min-w-0 text-xs text-muted wrap-anywhere"
                                                >{participant.riotId}</span
                                            >
                                        {/if}
                                    </span>
                                </span>
                            </td>
                            <td>
                                <PositionChips positions={participant.positions} />
                            </td>
                            <td
                                class="text-right whitespace-nowrap"
                                {@attach markChange(() => participant.status)}
                            >
                                {#if tag.state}
                                    <StatusTag text={tag.text} state={tag.state} />
                                {:else}
                                    <span class="text-xs text-muted">{tag.text}</span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {/if}
    </div>
</section>

{#if canSelect}
    <ManualRegistrationDialog bind:open={adding} {participants} />
{/if}
