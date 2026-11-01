<script lang="ts">
	import { Button } from 'stdf';
	import { resolve } from '$app/paths';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import type { DragState } from '#lib/components/teams/drag.svelte.ts';
	import { MATCH_STATUS } from '#lib/features/labels.ts';
	import type { BracketMatch, BracketSide, BracketTeam } from '#lib/features/scrims/bracket.ts';
	import BracketTeamContent from './BracketTeamContent.svelte';

	type Props = {
		match: BracketMatch;
		teams: BracketTeam[];
		guildId: string;
		// 앞 경기 이름. 승자 자리를 "준결승 A 승자"처럼 표시한다.
		labelOf: (key: string) => string;
		// 배치 자리 이름(예: 준결승 A 왼쪽, 결승 직행).
		seatLabel: (seat: string) => string;
		// 배치 중이면 자리에 팀을 놓고 빼는 조작을 보여 준다. 확정 후에는 점수와 승자를 보여 준다.
		editing: boolean;
		selectedId: string | null;
		drag: DragState;
		onselect: (teamId: string) => void;
		onplace: (seat: string, teamId: string | null) => void;
	};

	let { match, teams, guildId, labelOf, seatLabel, editing, selectedId, drag, onselect, onplace }: Props = $props();

	const teamOf = (id: string | null) => teams.find((team) => team.id === id) ?? null;
	const selectedName = $derived(teamOf(selectedId)?.name ?? '');
	const scored = $derived(match.status !== 'pending');
</script>

{#snippet seatRow(side: BracketSide, seat: string)}
	{@const team = teamOf(side.teamId)}
	{@const label = seatLabel(seat)}
	{@const targeting = selectedId !== null && selectedId !== side.teamId}
	<div
		role="group"
		aria-label={label}
		class={[
			'flex min-h-16 items-stretch gap-1 p-1.5 transition',
			drag.over === seat ? 'bg-primary/10 ring-2 ring-primary/40 ring-inset dark:bg-dark/15 dark:ring-dark/40' : ''
		]}
		ondragover={(event) => drag.enter(event, seat)}
		ondragleave={() => drag.leave(seat)}
		ondrop={(event) => drag.drop(event, seat)}
	>
		{#if targeting}
			<button
				type="button"
				class="flex min-w-0 flex-1 items-center gap-2 rounded-(--radius-small) border border-dashed border-primary/60 px-3 hover:bg-primary/5 dark:border-dark/60 dark:hover:bg-dark/10"
				onclick={() => onplace(seat, selectedId)}
			>
				{#if team}
					<BracketTeamContent {team} />
					<span class="shrink-0 text-xs font-semibold text-primary dark:text-dark">교체</span>
				{:else}
					<span class="flex-1 text-center text-sm font-semibold text-primary dark:text-dark">여기에 배치</span>
				{/if}
				<span class="sr-only">, {selectedName} 배치 위치 {label}</span>
			</button>
		{:else if team}
			<button
				type="button"
				draggable="true"
				aria-pressed={selectedId === team.id}
				class={[
					'flex min-w-0 flex-1 cursor-grab items-center rounded-(--radius-small) px-3 active:cursor-grabbing',
					drag.id === team.id && 'opacity-50',
					selectedId === team.id ? 'bg-primary/10 ring-2 ring-primary/40 dark:bg-dark/15 dark:ring-dark/40' : 'hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
				]}
				ondragstart={(event) => drag.start(event, team.id)}
				ondragend={() => drag.end()}
				onclick={() => onselect(team.id)}
			>
				<BracketTeamContent {team} />
			</button>
			<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="w-10" onclick={() => onplace(seat, null)}>
				<span aria-hidden="true" class="text-xl leading-none opacity-60">×</span>
				<span class="sr-only">{team.name} 배치 해제</span>
			</Button>
		{:else}
			<span class="flex flex-1 items-center justify-center rounded-(--radius-small) border border-dashed border-border text-sm text-gray-400 italic">
				비어 있음
			</span>
		{/if}
	</div>
{/snippet}

{#snippet resultRow(side: BracketSide, score: number, key: 'a' | 'b')}
	{@const team = teamOf(side.teamId)}
	{@const won = match.winner === key}
	<div class={['flex min-h-14 items-center gap-3 px-3 py-2', won && 'bg-success/10']}>
		<span class="flex min-w-0 flex-1 flex-col">
			<span class={['truncate text-sm', won ? 'font-bold' : 'font-medium', !team && 'opacity-50']}>
				{team?.name ?? (side.from ? `${labelOf(side.from)} 승자` : '미정')}
			</span>
			{#if team && side.from}<span class="text-xs opacity-60">{labelOf(side.from)} 승자</span>{/if}
		</span>
		{#if won}<span class="text-xs font-semibold text-success">승</span>{/if}
		<span class={['w-6 text-right text-xl font-semibold tabular-nums', won ? 'text-success' : 'opacity-60']}>{scored ? score : '–'}</span>
	</div>
{/snippet}

{#snippet sideRow(side: BracketSide, score: number, key: 'a' | 'b')}
	{#if editing && side.seat}
		{@render seatRow(side, side.seat)}
	{:else}
		{@render resultRow(side, score, key)}
	{/if}
{/snippet}

<!-- 경기 한 칸: 머리(이름·상태) + 양쪽 자리. 진행·종료 경기는 경기 상세로 연결한다. -->
<article
	aria-label={match.label}
	class={['overflow-hidden rounded-(--radius-form) border bg-bg-surface dark:bg-bg-surface-dark', match.status === 'in_progress' ? 'border-warning/60' : 'border-border']}
>
	<header class="flex min-h-9 items-center justify-between gap-2 border-b border-border bg-bg-highlight/40 px-3 dark:bg-bg-highlight-dark/40">
		<h4 class="text-xs font-semibold opacity-70">{match.label}</h4>
		{#if scored}<StatusTag {...MATCH_STATUS[match.status]} />{/if}
	</header>
	{#if match.matchId}
		<a href={resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.matchId })} class="block divide-y divide-border hover:bg-bg-highlight/40 dark:hover:bg-bg-highlight-dark/40">
			<span class="sr-only">{match.label} 경기 상세, </span>
			{@render sideRow(match.a, match.scoreA, 'a')}
			{@render sideRow(match.b, match.scoreB, 'b')}
		</a>
	{:else}
		<div class="divide-y divide-border">
			{@render sideRow(match.a, match.scoreA, 'a')}
			{@render sideRow(match.b, match.scoreB, 'b')}
		</div>
	{/if}
</article>
