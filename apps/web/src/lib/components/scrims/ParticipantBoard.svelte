<script lang="ts">
	import { Button, CellGroup, List, Loading, Tab, toast } from 'stdf';
	import type { BatchActionProps } from 'stdf';
	import PlayerName from '#lib/components/common/PlayerName.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { REGISTRATION_STATUS } from '#lib/features/labels.ts';
	import type { RegistrationStatus, ScrimParticipant, ScrimRegistrationCounts } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import PositionChips from './PositionChips.svelte';
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
		{ text: '신청', statuses: ['pending'] },
		{ text: '선발', statuses: ['selected'] },
		{ text: '대기', statuses: ['standby'] },
		{ text: '철회·제외', statuses: ['withdrawn', 'excluded'] }
	];
	const ACTIVE: RegistrationStatus[] = ['pending', 'selected', 'standby'];

	let filter = $state(0);
	let managing = $state(false);
	let selected = $state<(string | number)[]>([]);
	let pending = $state(false);

	const active = $derived(counts.pending + counts.selected + counts.standby);
	// 모바일 폭에는 다섯 칸에 숫자까지 들어가지 않는다. 신청·선발 수는 위 정원 줄에 있으므로 숫자를 뺀다.
	const labels = $derived(
		FILTERS.map(({ text, statuses }) => ({
			text: desktop.current
				? `${text} ${statuses ? statuses.reduce((sum, status) => sum + counts[status], 0) : participants.length}`
				: text
		}))
	);
	const shown = $derived.by(() => {
		const statuses = FILTERS[filter]!.statuses;
		return statuses ? participants.filter((participant) => statuses.includes(participant.status)) : participants;
	});
	// 선발 관리에서는 상태를 바꿀 수 있는 활성 신청만 다룬다.
	const selectable = $derived(participants.filter((participant) => ACTIVE.includes(participant.status)));

	async function apply(ids: (string | number)[], status: 'selected' | 'standby' | 'excluded') {
		if (status === 'excluded' && !(await confirm(`${ids.length}명을 제외할까요? 제외한 신청은 되돌릴 수 없어요.`, '참가자 제외'))) {
			return;
		}
		pending = true;
		const message = await postAction('participants', { ids: ids.join(','), status });
		pending = false;
		if (message) toast.error(message);
		else selected = [];
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
	<span class="flex min-w-0 flex-1 items-center gap-3">
		<span class={['min-w-0 flex-1', participant.status === 'withdrawn' && 'opacity-60']}>
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
<section aria-labelledby="participants">
	<CellGroup my="0" mx="0" shadow="none">
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-text-primary/5 px-4 py-3 dark:border-text-dark/5">
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h2 id="participants" class="text-lg font-semibold">참가자</h2>
				<span class="text-sm text-gray-600 tabular-nums dark:text-gray-300">신청 {active}/{counts.activeCapacity}명</span>
				{#if manager}
					<span class="text-sm text-gray-600 tabular-nums dark:text-gray-300">선발 {counts.selected}/{counts.playCapacity}명</span>
				{/if}
				{#if pending}
					<span class="self-center"><Loading type="1_0" height="6" width="6" /></span>
				{/if}
			</div>
			{#if canSelect && !managing}
				<span class="shrink-0">
					<Button
						fill="lineLight"
						size="auto"
						heightOut="0"
						heightIn="2"
						injClass="px-3 text-sm"
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
			<List
				data={selectable}
				keyField="registrationId"
				batchSelectable
				bind:batchMode={managing}
				bind:batchSelected={selected}
				{batchActions}
				transition={null}
				itemPy="3"
				itemInjClass="pl-4! pr-14!"
			>
				{#snippet itemChild(participant)}
					{@render row(participant, false)}
				{/snippet}
			</List>
		{:else if participants.length === 0}
			<p class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">아직 신청한 사람이 없어요</p>
		{:else}
			<div role="group" aria-label="상태 필터" class="border-b border-text-primary/5 px-2 py-1 dark:border-text-dark/5">
				<!-- 다섯 칸을 한 줄에 둔다. STDF Tab의 overflow 모드는 ResizeObserver 루프를 일으켜 쓰지 않는다. -->
				<Tab
					{labels}
					active={filter}
					showNum={5}
					tabInjClass="whitespace-nowrap px-0! text-sm"
					onclickTab={(index) => (filter = index)}
				/>
			</div>
			{#if shown.length === 0}
				<p class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">해당하는 참가자가 없어요</p>
			{:else}
				<ul aria-label={`${FILTERS[filter]!.text} 참가자`}>
					{#each shown as participant, index (participant.registrationId)}
						<li
							class={[
								'mx-4 flex py-3',
								index < shown.length - 1 && 'border-b border-text-primary/5 dark:border-text-dark/5'
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
