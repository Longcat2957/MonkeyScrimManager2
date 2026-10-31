<script lang="ts">
	import { Button, Loading, toast } from 'stdf';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import {
		moveAssignment,
		type Assignments,
		type FormationPlayer,
		type FormationTeam,
		type PairRecord,
		type SlotKey
	} from '#lib/features/scrims/formation.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import { DragState } from './drag.svelte.ts';
	import FormationHeadToHead from './FormationHeadToHead.svelte';
	import FormationPool from './FormationPool.svelte';
	import FormationSynergyRail from './FormationSynergyRail.svelte';
	import FormationTeamCard from './FormationTeamCard.svelte';
	import TeamNameDialog from './TeamNameDialog.svelte';

	type Props = {
		teams: FormationTeam[];
		players: FormationPlayer[];
		assignments: Assignments;
		confirmed: boolean;
		editable: boolean;
		pairs: Record<string, PairRecord>;
	};

	let { teams, players, assignments, confirmed, editable, pairs }: Props = $props();

	let selectedId = $state<string | null>(null);
	// 서버 응답 전에 화면을 먼저 바꾸는 낙관적 배정이다. 응답이 모두 끝나면 서버 값으로 돌아간다.
	let optimistic = $state<Assignments | null>(null);
	let pending = $state(0);
	let busy = $state(false);
	let renaming = $state<FormationTeam | null>(null);
	let renameOpen = $state(false);
	let details = $state(false);

	// 끌어 놓기: 자리에 놓으면 배치·교환, 미배정 목록에 놓으면 배정 해제다.
	const drag = new DragState({
		enabled: () => editable,
		accepts: (id, target) => target !== 'pool' || Boolean(current[id]),
		ondrop: (id, target) => move(id, target === 'pool' ? null : (target as SlotKey))
	});

	const current = $derived(optimistic ?? assignments);
	const unassigned = $derived(players.filter((player) => !current[player.registrationId]));
	const placed = $derived(players.length - unassigned.length);
	const selectedName = $derived(players.find((player) => player.registrationId === selectedId)?.displayName ?? '');
	const confirmBlocked = $derived(unassigned.length ? `미배정 ${unassigned.length}명이 남았어요` : null);

	function select(registrationId: string) {
		selectedId = selectedId === registrationId ? null : registrationId;
	}

	async function move(registrationId: string, slot: SlotKey | null) {
		selectedId = null;
		optimistic = moveAssignment(current, registrationId, slot);
		pending++;
		const message = await postAction('move', { registrationId, slot: slot ?? '' });
		pending--;
		if (message) {
			toast.error(message);
			optimistic = null;
		} else if (pending === 0) {
			optimistic = null;
		}
	}

	async function run(name: 'reset' | 'confirm') {
		busy = true;
		const message = await postAction(name, {});
		busy = false;
		if (message) toast.error(message);
	}

	async function reset() {
		if (await confirm('배정된 모든 참가자를 미배정으로 되돌릴까요?', '배정 초기화')) await run('reset');
	}

	async function confirmFormation() {
		if (await confirm('확정하면 팀을 바꿀 수 없어요. 확정할까요?', '편성 확정')) await run('confirm');
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && selectedId && !renameOpen) selectedId = null;
	}
</script>

<svelte:window {onkeydown} />

<!--
	엔트리 편성 작업판: 도구 줄 → 팀 열(1px 경계로 붙음) → 미배정 목록.
	참가자를 끌어 자리에 놓거나 누른 뒤 자리를 누르면 배치되고, 자리에 사람이 있으면 서로 바뀐다.
-->
<section
	aria-labelledby="manual-formation"
	aria-busy={pending > 0 || busy}
	class="w-full min-w-0 overflow-hidden rounded-(--radius-box) border border-border bg-border"
>
	<!-- 도구 줄 -->
	<div class="flex flex-col gap-2 bg-bg-surface px-4 py-3 md:flex-row md:items-center md:justify-between dark:bg-bg-surface-dark">
		<div class="flex min-w-0 flex-col">
			<div class="flex items-center gap-2">
				<h2 id="manual-formation" class="text-xs font-semibold opacity-60">수동 편성</h2>
				{#if confirmed}
					<StatusTag text="확정" state="success" />
				{:else if !editable}
					<StatusTag text="편성 중" state="info" />
				{/if}
				{#if pending > 0 || busy}
					<Loading type="1_0" height="6" width="6" />
				{/if}
			</div>
			<p class="truncate text-sm font-semibold tabular-nums">
				{placed}/{players.length} 배치{#if !confirmed} · 미배정 {unassigned.length}명{/if}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<!-- 시너지·라인 상대 전적 레일을 펼친다. -->
			<Button fill={details ? 'lineLight' : 'text'} size="auto" heightOut="0" heightIn="2" injClass="px-3 text-sm" onclick={() => (details = !details)}>
				{details ? '상세 닫기' : '상세'}
			</Button>
			{#if editable}
				<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-3 text-sm" disabled={placed === 0 || busy} onclick={reset}>초기화</Button>
				<Button size="auto" heightOut="0" heightIn="2" injClass="px-4 text-sm" disabled={Boolean(confirmBlocked) || busy || pending > 0} onclick={confirmFormation}>
					편성 확정
				</Button>
			{/if}
		</div>
	</div>

	{#if editable && (selectedId || confirmBlocked)}
		<!-- 선택 상태와 확정 조건을 같은 자리에서 한 줄로 알린다. -->
		<p class="flex min-h-10 flex-wrap items-center gap-2 bg-bg-surface px-4 text-sm dark:bg-bg-surface-dark" aria-live="polite">
			{#if selectedId}
				<span><strong>{selectedName}</strong> 선택됨 · 놓을 자리를 누르거나 끌어 놓으세요</span>
				<Button fill="text" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-sm" onclick={() => (selectedId = null)}>선택 취소</Button>
			{:else}
				<span class="opacity-70">{confirmBlocked}</span>
			{/if}
		</p>
	{/if}

	{#snippet teamColumn(team: FormationTeam, index: number)}
		<FormationTeamCard
			{team}
			{players}
			assignments={current}
			side={teams.length === 2 ? (index === 0 ? 'blue' : 'red') : null}
			{selectedId}
			interactive={editable}
			{drag}
			{details}
			onselect={select}
			onplace={(slot) => selectedId && move(selectedId, slot)}
			onremove={(id) => move(id, null)}
			onrename={() => ((renaming = team), (renameOpen = true))}
		/>
	{/snippet}

	<!-- 팀 열. 1px 간격으로 바탕 경계색이 비쳐 열 구분선이 된다. 좁은 화면에서는 가로로 넘긴다. -->
	<div class="relative overflow-x-auto">
		{#if details && teams.length === 2}
			<div class="grid min-w-[56rem] grid-cols-[8rem_minmax(0,1fr)_6rem_minmax(0,1fr)_8rem] gap-px pt-px">
				<FormationSynergyRail team={teams[0]!} {players} assignments={current} {pairs} />
				{@render teamColumn(teams[0]!, 0)}
				<FormationHeadToHead teams={[teams[0]!, teams[1]!]} {players} assignments={current} {pairs} />
				{@render teamColumn(teams[1]!, 1)}
				<FormationSynergyRail team={teams[1]!} {players} assignments={current} {pairs} />
			</div>
		{:else if details}
			<div class="grid min-w-[56rem] grid-cols-[8rem_minmax(0,1fr)_8rem_minmax(0,1fr)] gap-px pt-px">
				{#each teams as team, index (team.id)}
					<FormationSynergyRail {team} {players} assignments={current} {pairs} />
					{@render teamColumn(team, index)}
				{/each}
			</div>
		{:else}
			<div class="grid min-w-[30rem] grid-cols-2 gap-px pt-px">
				{#each teams as team, index (team.id)}
					{@render teamColumn(team, index)}
				{/each}
			</div>
		{/if}
	</div>

	{#if !confirmed}
		<div class="pt-px">
			<FormationPool players={unassigned} {selectedId} interactive={editable} {drag} onselect={select} />
		</div>
	{/if}
</section>

{#if editable}
	<TeamNameDialog bind:open={renameOpen} team={renaming} />
{/if}
