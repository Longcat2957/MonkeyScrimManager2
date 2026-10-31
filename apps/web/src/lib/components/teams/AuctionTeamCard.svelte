<script lang="ts">
	import { Button, Input } from 'stdf';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import { POSITIONS } from '#lib/features/labels.ts';
	import { bestMmr, formatMmr, TEAM_SIZE, type AuctionTeamView } from '#lib/features/scrims/formation.ts';
	import type { DragState } from './drag.svelte.ts';

	type Props = {
		team: AuctionTeamView;
		// 입찰 입력을 보여 줄지(운영자 + 진행 중인 후보가 있을 때)다.
		bidding: boolean;
		busy: boolean;
		// 현재 후보·유찰 후보를 이 패널로 끌어 놓으면 가격 없이 배치한다.
		drag: DragState;
		// 이 팀의 입찰가 입력값. 후보가 바뀌면 보드가 비운다.
		bid: string;
		onaward: (price: number) => void;
	};

	let { team, bidding, busy, drag, bid = $bindable(''), onaward }: Props = $props();

	const STEP = 10;
	const full = $derived(team.members.length >= TEAM_SIZE);
	const price = $derived(/^\d+$/.test(bid.trim()) ? Number(bid) : null);
	const overBudget = $derived(price !== null && price > team.remainingPoints);
	const captain = $derived(team.members.find((member) => member.via === 'captain')?.player ?? null);
	const laneText = (key: string | undefined) => POSITIONS.find((position) => position.key === key)?.text ?? '포지션 미정';

	function adjust(delta: number) {
		bid = String(Math.max(0, Math.min(team.remainingPoints, (price ?? 0) + delta)));
	}
</script>

<!-- 팀 한 칸: 이름·팀장, 남은 포인트, 인원 막대, 입찰 입력, 팀원. 작업판 안에서 다른 팀과 1px 경계로 붙는다. -->
<section
	aria-labelledby={`auction-${team.id}`}
	class={[
		'flex min-h-0 flex-col gap-3 p-3 transition',
		drag.over === team.id ? 'bg-primary/10 ring-2 ring-primary/40 ring-inset dark:bg-dark/15 dark:ring-dark/40' : 'bg-bg-surface dark:bg-bg-surface-dark'
	]}
	ondragover={(event) => drag.enter(event, team.id)}
	ondragleave={() => drag.leave(team.id)}
	ondrop={(event) => drag.drop(event, team.id)}
>
	<header class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
		<div class="flex min-w-0 flex-col gap-1">
			<h3 id={`auction-${team.id}`} class="flex min-w-0 items-center gap-1.5">
				<span class="shrink-0 border border-primary/30 px-1.5 py-0.5 text-xs font-semibold text-primary dark:border-dark/40 dark:text-dark">{team.name}</span>
				<span class="truncate text-base font-semibold">{captain?.displayName ?? '팀장 미지정'}</span>
			</h3>
			<span class="text-xs opacity-60 tabular-nums">시작 {team.startPoints}P</span>
		</div>
		<span class="shrink-0 border border-warning/40 px-2.5 py-1 text-base font-bold text-warning tabular-nums">
			{team.remainingPoints}P<span class="sr-only"> 남음</span>
		</span>
	</header>

	<div class="flex flex-col gap-1.5">
		<span class="text-xs opacity-60 tabular-nums">인원 {team.members.length}/{TEAM_SIZE}</span>
		<span aria-hidden="true" class="grid grid-cols-5 gap-1">
			{#each Array.from({ length: TEAM_SIZE }, (_, index) => index) as index (index)}
				<span class={['h-2 border', index < team.members.length ? (full ? 'border-success bg-success' : 'border-primary bg-primary dark:border-dark dark:bg-dark') : 'border-border bg-bg-highlight dark:bg-bg-highlight-dark']}></span>
			{/each}
		</span>
	</div>

	{#if bidding && !full}
		<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
			<!-- STDF Input 바깥 칸의 고정 여백(px-2 py-1)을 상쇄해 팀 패널 왼쪽 선에 맞춘다. -->
			<div class="-mx-2 -my-1 min-w-0">
				<Input
					placeholder="입찰가"
					inputmode="numeric"
					bind:value={bid}
					state={overBudget ? 'error' : 'theme'}
					tip={overBudget ? '남은 포인트를 넘어요' : null}
					py="1"
				/>
			</div>
			<!-- 좌클릭은 올리고 우클릭은 내린다. STDF Button이 contextmenu를 받지 않아 감싸는 요소에서 받는다. -->
			<span
				role="presentation"
				title="좌클릭 +{STEP} / 우클릭 −{STEP}"
				oncontextmenu={(event) => {
					event.preventDefault();
					if (!busy) adjust(-STEP);
				}}
			>
				<Button fill="lineLight" size="auto" heightOut="0" heightIn="3" injClass="px-2.5 text-sm font-semibold" disabled={busy} onclick={() => adjust(STEP)}>
					±{STEP}<span class="sr-only"> {team.name} 입찰가 {STEP} 올리기, 우클릭은 내리기</span>
				</Button>
			</span>
			<Button size="auto" heightOut="0" heightIn="3" injClass="px-3 text-sm" disabled={busy || price === null || overBudget} onclick={() => price !== null && onaward(price)}>
				낙찰<span class="sr-only"> {team.name}</span>
			</Button>
		</div>
	{/if}

	<ul class="flex min-h-0 flex-col gap-1 overflow-y-auto" aria-label={`${team.name} 팀원`}>
		{#each team.members as member (member.player.registrationId)}
			<li class="flex items-center gap-2 rounded-(--radius-small) bg-bg-highlight/50 px-2 py-2 dark:bg-bg-highlight-dark/50">
				<PlayerFace name={member.player.displayName} imageUrl={member.player.iconUrl} size="md" />
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-semibold">{member.player.displayName}</span>
					<span class="truncate text-xs opacity-60 tabular-nums">{laneText(member.player.positions[0])} · MMR {formatMmr(bestMmr(member.player))}</span>
				</span>
				<span
					class={[
						'shrink-0 px-2 py-0.5 text-xs font-semibold tabular-nums',
						member.via === 'captain' && 'bg-warning/15 text-warning',
						member.via === 'auction' && 'bg-bg-surface dark:bg-bg-surface-dark',
						member.via === 'manual' && 'bg-info/15 text-info'
					]}
				>
					{member.via === 'captain' ? '팀장' : member.via === 'manual' ? '수동' : `${member.price}P`}
				</span>
			</li>
		{:else}
			<li class="py-2 text-center text-sm opacity-60">아직 없음</li>
		{/each}
	</ul>
</section>
