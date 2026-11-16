<script lang="ts">
    import { tick } from 'svelte';
    import type { Attachment } from 'svelte/attachments';
    import { Button, CellGroup, List, Loading, toast } from 'stdf';
    import type { BatchActionProps } from 'stdf';
    import PlayerName from '#lib/components/common/PlayerName.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { REGISTRATION_STATUS } from '#lib/features/labels.ts';
    import type {
        RegistrationStatus,
        ScrimParticipant,
        ScrimRegistrationCounts
    } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import PositionChips from './PositionChips.svelte';
    import ManualRegistrationDialog from './ManualRegistrationDialog.svelte';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type Props = {
        guildId: string;
        participants: ScrimParticipant[];
        counts: ScrimRegistrationCounts;
        // 운영자에게 선발 현황을 함께 보여 준다.
        manager: boolean;
        // 모집 중인 운영자만 선발·대기·제외를 바꿀 수 있다.
        canSelect: boolean;
    };

    let { guildId, participants, counts, manager, canSelect }: Props = $props();

    const FILTERS: { text: string; statuses: RegistrationStatus[] | null }[] = [
        { text: '전체', statuses: null },
        { text: '선발', statuses: ['selected'] },
        { text: '대기', statuses: ['standby'] },
        { text: '철회·제외', statuses: ['withdrawn', 'excluded'] }
    ];
    const ACTIVE: RegistrationStatus[] = ['selected', 'standby'];

    let filter = $state(0);
    let managing = $state(false);
    let selected = $state<(string | number)[]>([]);
    let pending = $state(false);
    let adding = $state(false);
    let managementControls = $state<HTMLFieldSetElement>();

    const active = $derived(counts.selected + counts.standby);
    // 모바일 폭에는 네 칸에 숫자까지 넣지 않는다. 신청·선발 수는 위 정원 줄에 있으므로 숫자를 뺀다.
    const labels = $derived(
        FILTERS.map(({ text, statuses }) => ({
            text: desktop.current
                ? `${text} ${statuses ? statuses.reduce((sum, status) => sum + counts[status], 0) : participants.length}`
                : text
        }))
    );
    const shown = $derived.by(() => {
        const statuses = FILTERS[filter]!.statuses;
        return statuses
            ? participants.filter((participant) => statuses.includes(participant.status))
            : participants;
    });
    // 선발 관리에서는 상태를 바꿀 수 있는 활성 신청만 다룬다.
    const selectable = $derived(participants.filter((participant) => ACTIVE.includes(participant.status)));

    // STDF의 체크 표시와 행은 같은 선택을 실행하므로 행 하나만 조작 대상으로 남긴다.
    function selectionRows(ids: (string | number)[]): Attachment<HTMLFieldSetElement> {
        const pressed = new Set(ids.map(String));
        return (node) => {
            const originals = new Map<
                HTMLButtonElement,
                { pressed: string | null; inert: boolean; hidden: string | null; tabindex: string | null }
            >();
            const remember = (button: HTMLButtonElement) => {
                if (!originals.has(button)) {
                    originals.set(button, {
                        pressed: button.getAttribute('aria-pressed'),
                        inert: button.inert,
                        hidden: button.getAttribute('aria-hidden'),
                        tabindex: button.getAttribute('tabindex')
                    });
                }
            };
            const apply = () => {
                for (const marker of node.querySelectorAll<HTMLElement>('[data-participant-id]')) {
                    const button = marker.closest('button');
                    if (!button) continue;
                    remember(button);
                    button.dataset.participantChoice = '';
                    button.setAttribute('aria-pressed', String(pressed.has(marker.dataset.participantId!)));
                    const icon = button.parentElement?.previousElementSibling;
                    if (icon instanceof HTMLButtonElement) {
                        remember(icon);
                        icon.inert = true;
                        icon.setAttribute('aria-hidden', 'true');
                        icon.setAttribute('tabindex', '-1');
                    }
                }
            };
            apply();
            const observer = new MutationObserver(apply);
            observer.observe(node, { childList: true, subtree: true });
            return () => {
                observer.disconnect();
                for (const [button, original] of originals) {
                    delete button.dataset.participantChoice;
                    button.inert = original.inert;
                    for (const [name, value] of Object.entries({
                        'aria-pressed': original.pressed,
                        'aria-hidden': original.hidden,
                        tabindex: original.tabindex
                    })) {
                        if (value === null) button.removeAttribute(name);
                        else button.setAttribute(name, value);
                    }
                }
            };
        };
    }

    async function apply(ids: (string | number)[], status: 'selected' | 'standby' | 'excluded') {
        if (pending || ids.length === 0) return;
        const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (
            status === 'excluded' &&
            !(await confirm(
                `${ids.length}명을 제외할까요? 제외한 신청은 되돌릴 수 없고, 빈 선발 자리는 먼저 신청한 대기자가 채워요.`,
                '참가자 제외'
            ))
        ) {
            return;
        }
        if (pending) return;
        pending = true;
        try {
            const message = await postAction('participants', { ids: ids.join(','), status });
            if (message) toast.error(message);
            else selected = [];
        } finally {
            pending = false;
            await tick();
            const focus = trigger?.isConnected
                ? trigger
                : managementControls?.querySelector<HTMLButtonElement>('button:not(:disabled)');
            focus?.focus({ preventScroll: true });
        }
    }

    const batchActions: BatchActionProps[] = [
        { text: '선발', status: 'success', onclick: (ids) => apply(ids, 'selected') },
        { text: '대기', status: 'info', onclick: (ids) => apply(ids, 'standby') },
        { text: '제외', status: 'error', onclick: (ids) => apply(ids, 'excluded') }
    ];
</script>

{#snippet statusOf(participant: ScrimParticipant)}
    {@const status = REGISTRATION_STATUS[participant.status]}
    {#if status.state}
        <StatusTag text={status.text} state={status.state} />
    {:else}
        <span class="text-xs opacity-60">{status.text}</span>
    {/if}
{/snippet}

{#snippet row(participant: ScrimParticipant, link: boolean)}
    <span
        data-participant-id={participant.registrationId}
        class="participant-content flex min-w-0 flex-1 items-center gap-3"
    >
        <span
            class={[
                'participant-identity min-w-0 flex-1',
                participant.status === 'withdrawn' && 'opacity-60'
            ]}
        >
            <PlayerName
                {guildId}
                displayName={participant.displayName}
                userId={participant.userId}
                imageUrl={participant.iconUrl}
                riotId={participant.riotId}
                {link}
            />
        </span>
        <span class="shrink-0"><PositionChips positions={participant.positions} /></span>
        <span class="flex w-12 shrink-0 justify-end">{@render statusOf(participant)}</span>
    </span>
{/snippet}

<!-- 제목·인원·필터·목록을 참가자 패널 한 상자에 둔다. -->
<section aria-labelledby="participants" aria-busy={pending}>
    <CellGroup my="0" mx="0" shadow="none">
        <div
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-text-primary/5 px-4 py-3 dark:border-text-dark/5"
        >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="participants" class="text-lg font-semibold">참가자</h2>
                <span class="text-sm text-gray-600 tabular-nums dark:text-gray-300"
                    >신청 {active}/{counts.activeCapacity}명</span
                >
                {#if manager}
                    <span class="text-sm text-gray-600 tabular-nums dark:text-gray-300"
                        >선발 {counts.selected}/{counts.playCapacity}명</span
                    >
                {/if}
                {#if pending}
                    <span class="self-center"><Loading type="1_0" height="6" width="6" /></span>
                {/if}
            </div>
            {#if canSelect && !managing}
                <span class="flex shrink-0 flex-wrap gap-2">
                    <Button
                        fill="lineLight"
                        size="auto"
                        heightOut="0"
                        injClass="min-h-11 px-3 text-sm"
                        disabled={active >= counts.activeCapacity}
                        onclick={() => (adding = true)}
                    >
                        참가자 추가
                    </Button>
                    <Button
                        fill="lineLight"
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        injClass="min-h-11 px-3 text-sm"
                        disabled={selectable.length === 0}
                        onclick={() => ((selected = []), (managing = true))}
                    >
                        선발 관리
                    </Button>
                </span>
            {/if}
        </div>

        {#if managing}
            <!--
				STDF List가 일괄 선택 막대(전체 선택·작업·완료)를 그린다. 완료를 누르면 batchMode가 꺼지고 보기 목록으로 돌아간다.
				선택 칸(40px)만큼 행이 오른쪽으로 밀리므로 오른쪽 여백을 그만큼 더 둔다.
			-->
            <fieldset
                bind:this={managementControls}
                disabled={pending}
                aria-labelledby="participants"
                class="management-controls min-w-0"
                {@attach selectionRows(selected)}
            >
                <List
                    data={selectable}
                    keyField="registrationId"
                    batchSelectable
                    bind:batchMode={managing}
                    bind:batchSelected={selected}
                    {batchActions}
                    transition={null}
                    injClass="[&_button]:min-h-11 [&_button]:min-w-11 [&>div:first-child]:flex-wrap [&>div:first-child]:gap-2 [&>div:first-child>div]:flex-wrap [&>div:first-child>div]:gap-1"
                    itemPy="3"
                    itemInjClass="pl-4! pr-14!"
                >
                    {#snippet itemChild(participant)}
                        {@render row(participant, false)}
                    {/snippet}
                </List>
            </fieldset>
        {:else if participants.length === 0}
            <p class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                아직 신청한 사람이 없어요
            </p>
        {:else}
            <div
                role="group"
                aria-label="상태 필터"
                class="border-b border-text-primary/5 px-2 py-1 dark:border-text-dark/5"
            >
                <!-- 네 칸을 한 줄에 둔다. STDF Tab의 overflow 모드는 ResizeObserver 루프를 일으켜 쓰지 않는다. -->
                <SelectionTabs
                    {labels}
                    active={filter}
                    showNum={4}
                    tabInjClass="whitespace-nowrap px-0! text-sm"
                    onclickTab={(index) => (filter = index)}
                />
            </div>
            {#if shown.length === 0}
                <p class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    해당하는 참가자가 없어요
                </p>
            {:else}
                <ul aria-label={`${FILTERS[filter]!.text} 참가자`}>
                    {#each shown as participant, index (participant.registrationId)}
                        <li
                            class={[
                                'mx-4 flex py-3',
                                index < shown.length - 1 &&
                                    'border-b border-text-primary/5 dark:border-text-dark/5'
                            ]}
                        >
                            {@render row(participant, true)}
                        </li>
                    {/each}
                </ul>
            {/if}
        {/if}
    </CellGroup>
</section>

{#if canSelect}
    <ManualRegistrationDialog bind:open={adding} {participants} />
{/if}

<style>
    .management-controls {
        container: participant-selection / inline-size;
    }

    @container participant-selection (width < 20rem) {
        .participant-content {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 0.5rem 0.75rem;
        }

        .participant-identity {
            grid-column: 1 / -1;
        }
    }

    .management-controls :global(button[data-participant-choice]) {
        position: relative;
    }

    /* STDF가 왼쪽으로 분리한 체크 표시까지 같은 행 버튼의 조작 영역에 포함한다. */
    .management-controls :global(button[data-participant-choice]::before) {
        position: absolute;
        inset-block: 0;
        inset-inline-start: -2.5rem;
        inline-size: 2.5rem;
        content: '';
    }
</style>
