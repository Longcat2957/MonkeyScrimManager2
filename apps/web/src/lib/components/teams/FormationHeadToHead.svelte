<script lang="ts">
	import { POSITIONS } from '#lib/features/labels.ts';
	import {
		headToHead,
		LANES,
		occupantOf,
		slotKey,
		type Assignments,
		type FormationPlayer,
		type FormationTeam,
		type PairRecord
	} from '#lib/features/scrims/formation.ts';

	type Props = {
		// 두 팀일 때만 쓴다. 같은 포지션끼리 지난 내전에서 맞붙은 전적을 왼쪽 팀 기준으로 보여 준다.
		teams: [FormationTeam, FormationTeam];
		players: FormationPlayer[];
		assignments: Assignments;
		pairs: Record<string, PairRecord>;
	};

	let { teams, players, assignments, pairs }: Props = $props();

	const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
	const at = (teamId: string, lane: (typeof LANES)[number]) => {
		const id = occupantOf(assignments, slotKey(teamId, lane));
		return id ? (players.find((player) => player.registrationId === id) ?? null) : null;
	};
</script>

<aside aria-labelledby="head-to-head" class="flex min-w-0 flex-col bg-bg-surface dark:bg-bg-surface-dark">
	<div class="flex h-14 flex-col justify-center px-2 text-center">
		<h3 id="head-to-head" class="text-xs font-semibold opacity-70">라인 상대 전적</h3>
		<p class="text-[0.6875rem] opacity-50">{teams[0].name} 기준</p>
	</div>
	<ol class="grid grid-rows-[repeat(5,4.75rem)] gap-1.5 px-2 pb-2">
		{#each LANES as lane (lane)}
			{@const a = at(teams[0].id, lane)}
			{@const b = at(teams[1].id, lane)}
			{@const record = a && b ? headToHead(pairs, a.registrationId, b.registrationId) : null}
			<li class="flex flex-col items-center justify-center rounded-(--radius-small) border border-border text-center">
				<span class="sr-only">{laneText(lane)}</span>
				{#if record}
					<span
						class={[
							'text-lg font-bold leading-none',
							record.wins > record.losses && 'text-success',
							record.wins < record.losses && 'text-error'
						]}
						aria-hidden="true"
					>
						{record.wins > record.losses ? '>' : record.wins < record.losses ? '<' : '='}
					</span>
					<span class="mt-1 text-xs font-semibold tabular-nums">{record.wins}-{record.losses}</span>
					<span class="text-[0.6875rem] opacity-60">
						{record.wins === record.losses ? '동률' : `${Math.abs(record.wins - record.losses)}승 ${record.wins > record.losses ? '우위' : '열세'}`}
					</span>
				{:else}
					<span class="text-xs opacity-50">{a && b ? '맞대결 없음' : '-'}</span>
				{/if}
			</li>
		{/each}
	</ol>
</aside>
