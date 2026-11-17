<script lang="ts">
    import { tick } from 'svelte';
    import { resolve } from '$app/paths';
    import Button from '#lib/components/common/Button.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { REGISTRATION_STATUS } from '#lib/features/labels.ts';
    import type {
        RegistrationStatus,
        ScrimParticipant,
        ScrimRegistrationCounts
    } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
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
        FILTERS.map(({ text, statuses }) => ({
            text: desktop.current
                ? `${text} ${statuses.reduce((sum, status) => sum + counts[status], 0)}`
                : text
        }))
    );
    const shown = $derived.by(() => {
        const statuses = FILTERS[filter]!.statuses;
        return participants.filter((participant) => statuses.includes(participant.status));
    });
    const selectable = $derived(participants.filter((participant) => ACTIVE.includes(participant.status)));

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
                ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
                ?.focus({ preventScroll: true });
        }
    }
</script>

<section
    class="hex-panel flex min-w-0 flex-col overflow-hidden"
    aria-labelledby="participants"
    aria-busy={pending}
>
    <div class="flex flex-wrap items-center gap-2 border-b border-brass-line px-4 py-3">
        <h2 id="participants" class="text-base font-semibold">참가자</h2>
        <span
            class="rounded-(--radius-small) border border-brass-line bg-bg-overlay px-2 py-0.5 text-xs text-text-muted dark:bg-bg-overlay-dark"
            >신청 {active}/{counts.activeCapacity}명</span
        >
        {#if manager}
            <span
                class="rounded-(--radius-small) border border-brass-line bg-bg-overlay px-2 py-0.5 text-xs text-text-muted dark:bg-bg-overlay-dark"
                >선발 {counts.selected}/{counts.playCapacity}명</span
            >
        {/if}
        {#if pending}<span
                class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
            ></span>{/if}

        {#if !managing}
            <div
                role="tablist"
                aria-label="상태 필터"
                class="ml-1 inline-flex gap-0.5 rounded-(--radius-small) border border-brass-line bg-bg-overlay p-0.5 dark:bg-bg-overlay-dark"
            >
                {#each labels as label, index (label.text)}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={filter === index}
                        class={[
                            'min-h-7 whitespace-nowrap rounded-[3px] px-2.5 text-xs font-semibold',
                            filter === index
                                ? 'bg-hex/15 text-hex'
                                : 'text-text-muted hover:text-text-primary dark:hover:text-text-dark'
                        ]}
                        onclick={() => (filter = index)}
                    >
                        {label.text}
                    </button>
                {/each}
            </div>
        {/if}

        {#if canSelect && !managing}
            <div class="ml-auto flex shrink-0 gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={active >= counts.activeCapacity}
                    onclick={() => (adding = true)}
                >
                    참가자 추가
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={selectable.length === 0}
                    onclick={() => (managing = true)}
                >
                    선발 관리
                </Button>
            </div>
        {/if}
    </div>

    {#if managing}
        <div
            class="flex flex-wrap items-center justify-between gap-2 border-b border-brass-line bg-hex/5 px-3 py-2"
        >
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
                <Button variant="quiet" size="sm" onclick={() => (managing = false)}>완료</Button>
            </div>
        </div>
    {/if}

    <div bind:this={controls} class="min-h-0 flex-1 overflow-y-auto">
        {#if participants.length === 0}
            <p class="px-4 py-10 text-center text-sm text-text-muted">아직 신청한 사람이 없어요</p>
        {:else if shown.length === 0}
            <p class="px-4 py-10 text-center text-sm text-text-muted">해당하는 참가자가 없어요</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full border-collapse text-sm">
                    <thead>
                        <tr
                            class="border-b border-brass-line bg-bg-overlay text-xs text-text-muted dark:bg-bg-overlay-dark"
                        >
                            {#if managing}<th class="w-9 px-3 py-2"><span class="sr-only">선택</span></th
                                >{/if}
                            <th class="px-2 py-1.5 text-left font-medium sm:px-4">참가자</th>
                            <th class="px-2 py-1.5 text-left font-medium sm:px-4">희망 포지션</th>
                            <th class="px-2 py-1.5 text-right font-medium sm:px-4">상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each shown as participant, index (participant.registrationId)}
                            {@const tag = REGISTRATION_STATUS[participant.status]}
                            <tr
                                class={[
                                    'h-[46px] border-b border-brass-line/60 last:border-0 hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark',
                                    managing && selected.includes(participant.registrationId) && 'bg-hex/5'
                                ]}
                            >
                                {#if managing}
                                    <td class="px-3">
                                        <input
                                            type="checkbox"
                                            class="size-4 accent-[var(--color-hex)]"
                                            checked={selected.includes(participant.registrationId)}
                                            disabled={!ACTIVE.includes(participant.status) || pending}
                                            aria-label={`${participant.displayName} 선택`}
                                            onchange={() => toggle(participant.registrationId)}
                                        />
                                    </td>
                                {/if}
                                <td class="px-2 sm:px-4">
                                    <span class="flex min-w-0 items-center gap-2">
                                        <span
                                            class="grid size-7 shrink-0 place-items-center rounded-[5px] border border-brass-line bg-bg-overlay text-xs font-bold dark:bg-bg-overlay-dark"
                                            aria-hidden="true">{participant.displayName.slice(0, 1)}</span
                                        >
                                        <span class="flex min-w-0 flex-col">
                                            {#if participant.userId && !managing}
                                                <a
                                                    href={resolve('/g/[guildId]/players/[userId]', {
                                                        guildId,
                                                        userId: participant.userId
                                                    })}
                                                    class="truncate font-semibold hover:underline"
                                                    >{participant.displayName}</a
                                                >
                                            {:else}
                                                <span class="truncate font-semibold"
                                                    >{participant.displayName}</span
                                                >
                                            {/if}
                                            {#if participant.riotId}
                                                <span class="truncate text-xs text-text-muted"
                                                    >{participant.riotId}</span
                                                >
                                            {/if}
                                        </span>
                                    </span>
                                </td>
                                <td class="px-2 sm:px-4">
                                    <PositionChips positions={participant.positions} />
                                </td>
                                <td class="w-16 px-2 text-right whitespace-nowrap sm:px-4">
                                    {#if tag.state}
                                        <StatusTag text={tag.text} state={tag.state} />
                                    {:else}
                                        <span class="text-xs text-text-muted">{tag.text}</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</section>

{#if canSelect}
    <ManualRegistrationDialog bind:open={adding} {participants} />
{/if}
