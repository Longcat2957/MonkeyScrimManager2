<script lang="ts">
	import { Button } from 'stdf';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import PositionIcon from '#lib/components/common/PositionIcon.svelte';
	import { POSITIONS } from '#lib/features/labels.ts';
	import {
		formatMmr,
		LANES,
		occupantOf,
		slotKey,
		teamAverage,
		type Assignments,
		type FormationPlayer,
		type FormationTeam,
		type SlotKey
	} from '#lib/features/scrims/formation.ts';
	import type { DragState } from './drag.svelte.ts';

	type Props = {
		team: FormationTeam;
		players: FormationPlayer[];
		assignments: Assignments;
		// 두 팀이면 진영 표시(BLUE·RED)를 붙인다.
		side: 'blue' | 'red' | null;
		// 놓을 자리를 고르는 중인 참가자다. 있으면 각 자리가 "여기에 배치" 버튼이 된다.
		selectedId: string | null;
		interactive: boolean;
		drag: DragState;
		details: boolean;
		onselect: (registrationId: string) => void;
		onplace: (slot: SlotKey) => void;
		onremove: (registrationId: string) => void;
		onrename?: () => void;
	};

	let { team, players, assignments, side, selectedId, interactive, drag, details, onselect, onplace, onremove, onrename }: Props = $props();

	const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
	const playerOf = (id: string | null) => (id ? (players.find((player) => player.registrationId === id) ?? null) : null);
	const average = $derived(teamAverage(team.id, players, assignments));
	const selectedName = $derived(playerOf(selectedId)?.displayName ?? '');
</script>

<!-- 팀 한 열: 머리 + 포지션 다섯 자리. 작업판 안에서 다른 열과 1px 경계로 붙는다. -->
<section aria-labelledby={`team-${team.id}`} class="flex min-w-0 flex-col bg-bg-surface dark:bg-bg-surface-dark">
	<header class="flex h-14 items-center justify-between gap-2 px-3">
		<div class="flex min-w-0 flex-col">
			<h3 id={`team-${team.id}`} class="truncate text-sm font-semibold">{team.name}</h3>
			{#if details}
				<span class="text-[0.6875rem] text-gray-500 tabular-nums dark:text-gray-400">평균 {formatMmr(average)}</span>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#if onrename && interactive}
				<Button fill="text" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-xs" onclick={onrename}>이름 변경</Button>
			{/if}
			{#if side}
				<span
					class={[
						'border px-2 py-1 text-[0.6875rem] font-semibold tracking-wide',
						side === 'blue' ? 'border-info/40 text-info' : 'border-error/40 text-error'
					]}
				>
					{side === 'blue' ? 'BLUE' : 'RED'}
				</span>
			{/if}
		</div>
	</header>

	<ol class="grid grid-rows-[repeat(5,4.75rem)] gap-1.5 px-2 pb-2">
		{#each LANES as lane (lane)}
			{@const slot = slotKey(team.id, lane)}
			{@const player = playerOf(occupantOf(assignments, slot))}
			{@const targeting = interactive && selectedId !== null && selectedId !== player?.registrationId}
			{@const offLane = player !== null && !player.positions.includes(lane)}
			<li
				role="group"
				aria-label={`${team.name} ${laneText(lane)} 자리`}
				class={[
					'grid min-h-0 items-stretch gap-2 border p-1.5 transition',
					interactive ? 'grid-cols-[3rem_minmax(0,1fr)_2.75rem]' : 'grid-cols-[3rem_minmax(0,1fr)]',
					drag.over === slot
						? 'rounded-(--radius-form) border-primary/70 bg-primary/10 ring-1 ring-primary/40 dark:border-dark/70 dark:bg-dark/15'
						: player
							? 'rounded-(--radius-form) border-border bg-bg-highlight/40 dark:bg-bg-highlight-dark/40'
							: 'rounded-(--radius-small) border-dashed border-border'
				]}
				ondragover={(event) => drag.enter(event, slot)}
				ondragleave={() => drag.leave(slot)}
				ondrop={(event) => drag.drop(event, slot)}
			>
				<span class="flex items-center justify-center rounded-(--radius-small) bg-text-primary/5 dark:bg-text-dark/5" title={laneText(lane)}>
					<PositionIcon position={lane} size="lg" />
					<span class="sr-only">{laneText(lane)}</span>
				</span>

				{#snippet occupant(item: FormationPlayer)}
					<PlayerFace name={item.displayName} imageUrl={item.iconUrl} size="md" />
					<span class="flex min-w-0 flex-1 flex-col text-left">
						<span class="truncate text-sm font-semibold">{item.displayName}</span>
						<span class="truncate text-[0.6875rem] text-gray-500 tabular-nums dark:text-gray-400">
							MMR {formatMmr(item.mmr[lane])}
							{#if offLane}<span class="text-warning"> · 희망 외</span>{/if}
						</span>
					</span>
				{/snippet}

				{#if targeting}
					<button
						type="button"
						class="flex min-w-0 items-center gap-2 rounded-(--radius-small) border border-dashed border-primary/60 px-2 text-sm hover:bg-primary/5 dark:border-dark/60 dark:hover:bg-dark/10"
						onclick={() => onplace(slot)}
					>
						{#if player}
							{@render occupant(player)}
							<span class="shrink-0 text-xs font-semibold text-primary dark:text-dark">교환</span>
						{:else}
							<span class="flex-1 text-center font-semibold text-primary dark:text-dark">여기에 배치</span>
						{/if}
						<span class="sr-only">, {selectedName} 배치 위치 {team.name} {laneText(lane)}</span>
					</button>
				{:else if player && interactive}
					<button
						type="button"
						draggable="true"
						aria-pressed={selectedId === player.registrationId}
						class={[
							'flex min-w-0 cursor-grab items-center gap-2 rounded-(--radius-small) px-2 active:cursor-grabbing',
							drag.id === player.registrationId && 'opacity-50',
							selectedId === player.registrationId
								? 'bg-primary/10 ring-2 ring-primary/40 dark:bg-dark/15 dark:ring-dark/40'
								: 'bg-bg-surface hover:bg-bg-highlight dark:bg-bg-surface-dark dark:hover:bg-bg-highlight-dark'
						]}
						ondragstart={(event) => drag.start(event, player.registrationId)}
						ondragend={() => drag.end()}
						onclick={() => onselect(player.registrationId)}
					>
						{@render occupant(player)}
					</button>
				{:else if player}
					<span class="flex min-w-0 items-center gap-2 rounded-(--radius-small) bg-bg-surface px-2 dark:bg-bg-surface-dark">
						{@render occupant(player)}
					</span>
				{:else}
					<span class="flex items-center justify-center text-sm text-gray-400 italic">비어 있음</span>
				{/if}

				{#if interactive}
					<span class="flex items-center justify-center">
						{#if player && !targeting}
							<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="h-full w-full" onclick={() => onremove(player.registrationId)}>
								<span aria-hidden="true" class="text-xl leading-none opacity-60">×</span>
								<span class="sr-only">{player.displayName} 배정 해제</span>
							</Button>
						{/if}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</section>
