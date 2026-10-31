<script lang="ts">
	import { onMount } from 'svelte';
	import { Accordion, Button, Loading, toast } from 'stdf';
	import { invalidate } from '$app/navigation';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import PositionIcon from '#lib/components/common/PositionIcon.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { POSITIONS } from '#lib/features/labels.ts';
	import { formatMmr, TEAM_SIZE, winRate, type AuctionView } from '#lib/features/scrims/formation.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import AuctionTargetProfile from './AuctionTargetProfile.svelte';
	import AuctionTeamCard from './AuctionTeamCard.svelte';
	import CandidateListDialog from './CandidateListDialog.svelte';
	import { DragState } from './drag.svelte.ts';

	let { auction, manager }: { auction: AuctionView; manager: boolean } = $props();

	// 입찰가를 조정할 때마다 다시 차는 진행자용 타이머다. 결과를 강제하지 않는 안내용이다.
	const TIMER_MS = 10_000;

	let bids = $state<Record<string, string>>({});
	let busy = $state(false);
	let refreshing = $state(false);
	let timerStart = $state(Date.now());
	let now = $state(Date.now());
	let details = $state(false);
	let listOpen = $state(false);

	const live = $derived(auction.status === 'in_progress');
	const controls = $derived(manager && live);
	const open = $derived(auction.openLot);
	const profile = $derived(auction.openProfile);
	const canRevert = $derived(auction.history.some((entry) => !entry.voided));
	const remainingMs = $derived(Math.max(0, TIMER_MS - (now - timerStart)));
	const mainLane = $derived(open ? (open.positions[0] ?? profile?.mainLane ?? 'mid') : 'mid');
	const recentWins = $derived(profile?.recentGames.filter((game) => game.win).length ?? 0);
	const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
	const STATUS = { setup: { text: '준비', state: 'theme' }, in_progress: { text: '진행 중', state: 'warning' }, completed: { text: '완료', state: 'success' }, cancelled: { text: '취소', state: 'error' } } as const;
	const RESULT = { sold: '낙찰', unsold: '유찰', manual: '수동 배치' } as const;

	// 현재 매물이나 유찰 후보를 팀 패널로 끌어 놓으면 가격 없이 배치한다.
	const drag = new DragState({
		enabled: () => controls && !busy,
		accepts: (id, teamId) => {
			const team = auction.teams.find((item) => item.id === teamId);
			const movable = id === open?.registrationId || (!open && auction.unsold.some((player) => player.registrationId === id));
			return Boolean(team && team.members.length < TEAM_SIZE && movable);
		},
		ondrop: (id, teamId) => (id === open?.registrationId ? run('assignCurrent', { teamId }) : run('assign', { registrationId: id, teamId }))
	});

	// 후보가 바뀌거나 입찰가가 바뀌면 타이머를 다시 채운다.
	$effect(() => {
		if (!open) details = false;
		void open?.registrationId;
		void JSON.stringify(bids);
		timerStart = Date.now();
	});

	onMount(() => {
		const interval = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(interval);
	});

	async function run(name: string, fields: Record<string, string> = {}) {
		busy = true;
		const message = await postAction(name, fields);
		busy = false;
		if (message) toast.error(message);
		return !message;
	}

	async function award(teamId: string, price: number) {
		if (await run('award', { teamId, price: String(price) })) bids = {};
	}

	async function draw() {
		if (await run('draw')) bids = {};
	}

	async function revert() {
		if (await confirm('마지막 기록을 되돌리고 그 후보를 다시 진행할까요? 기록은 되돌림으로 남아요.', '마지막 기록 되돌리기')) await run('revert');
	}

	async function reset() {
		if (await confirm('낙찰·유찰·수동 배치를 모두 되돌리고 팀장과 시작 포인트만 남긴 처음 상태로 돌아갈까요?', '경매 초기화')) await run('reset');
	}

	async function refresh() {
		refreshing = true;
		await invalidate('app:auction');
		refreshing = false;
	}
</script>

<section aria-labelledby="auction-board" aria-busy={busy || refreshing} class="flex w-full min-w-0 flex-col gap-2">
	<div class="flex min-h-8 items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<h2 id="auction-board" class="text-base font-semibold">경매</h2>
			<StatusTag text={STATUS[auction.status].text} state={STATUS[auction.status].state} />
			{#if busy || refreshing}<Loading type="1_0" height="6" width="6" />{/if}
		</div>
		{#if live && !manager}
			<!-- 실시간 갱신 방식이 정해지기 전까지 열람자는 직접 새로 불러온다. -->
			<Button fill="text" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-sm" disabled={refreshing} onclick={refresh}>새로고침</Button>
		{/if}
	</div>

	{#if controls && open}
		<!-- 진행자용 조정 타이머. 화면 맨 위에 크게 두고, 남은 시간에 따라 색을 바꾼다. -->
		{@const seconds = Math.ceil(remainingMs / 1000)}
		<!-- 남은 초 기준: 10~7초 녹색, 6~3초 주황, 3초 미만 빨간색 -->
		{@const tone = seconds >= 7 ? 'success' : seconds >= 3 ? 'warning' : 'error'}
		<div aria-hidden="true" class="relative h-7 w-full overflow-hidden rounded-(--radius-small) bg-bg-highlight dark:bg-bg-highlight-dark">
			<div
				class={['h-full transition-[width,background-color] duration-200 ease-linear', { success: 'bg-success', warning: 'bg-warning', error: 'bg-error' }[tone]]}
				style:width="{(remainingMs / TIMER_MS) * 100}%"
			></div>
			<span class={['absolute inset-y-0 right-3 flex items-center text-sm font-bold tabular-nums', tone === 'error' && 'text-error']}>{seconds}초</span>
		</div>
	{/if}

	<!-- 작업판: 왼쪽 현재 매물·후보 현황, 오른쪽 팀 패널. 1px 경계로 붙는다. -->
	<div class={['overflow-hidden rounded-(--radius-box) border border-border bg-border', live && 'grid gap-px xl:h-[52rem] xl:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]']}>
		{#if live}
			<div class="grid min-h-0 gap-px xl:grid-rows-[minmax(0,1fr)_auto]">
				<!-- 현재 매물 -->
				<section aria-labelledby="open-lot" class="flex min-h-0 flex-col bg-bg-surface dark:bg-bg-surface-dark">
					<div class="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
						<div class="flex items-center gap-2">
							<h3 id="open-lot" class="text-base font-semibold">현재 매물</h3>
							{#if open}<span class="size-2 rounded-full bg-success" aria-hidden="true"></span>{/if}
						</div>
						<div class="flex flex-wrap items-center justify-end gap-0.5">
							{#if controls && canRevert}
								<Button fill="textState" state="warning" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-sm" disabled={busy} onclick={revert}>되돌리기</Button>
							{/if}
							{#if open}
								<Button fill={details ? 'lineLight' : 'text'} size="auto" heightOut="0" heightIn="1" injClass="px-2 text-sm" onclick={() => (details = !details)}>상세보기</Button>
							{/if}
							{#if controls}
								<Button fill="text" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-sm" disabled={busy || Boolean(open) || auction.queue.length === 0} onclick={draw}>다음 후보</Button>
							{/if}
						</div>
					</div>

					<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
						{#if open}
							<!-- 운영자는 이 카드를 팀 패널로 끌어 가격 없이 배치할 수 있다. -->
							<div
								role="group"
								aria-label={`현재 매물 ${open.displayName}`}
								draggable={controls}
								class={[
									'relative isolate flex shrink-0 flex-col overflow-hidden border px-4 py-5',
									details ? 'gap-3' : 'min-h-[24rem] justify-between gap-5',
									controls && 'cursor-grab active:cursor-grabbing',
									drag.id === open.registrationId ? 'border-primary/60 bg-primary/10 opacity-70' : 'border-primary/30 bg-bg-highlight/30 dark:border-dark/30 dark:bg-bg-highlight-dark/30'
								]}
								ondragstart={(event) => drag.start(event, open.registrationId)}
								ondragend={() => drag.end()}
							>
								{#if !details}
									<span class="pointer-events-none absolute top-5 right-5 opacity-15" aria-hidden="true"><PositionIcon position={mainLane} size="lg" /></span>
								{/if}
								<div class="flex items-start justify-between gap-3">
									<span class="inline-flex items-center gap-1 border border-primary/25 bg-primary/10 px-2 py-1 text-sm font-semibold dark:border-dark/30 dark:bg-dark/15">
										<PositionIcon position={mainLane} size="sm" />{laneText(mainLane)}
									</span>
									{#if profile?.riot?.tier}
										<span class="border border-warning/30 bg-warning/10 px-2 py-1 text-sm font-semibold text-warning">{profile.riot.tier}</span>
									{/if}
								</div>
								<div class={['flex items-center gap-3', details ? 'flex-row' : 'flex-col text-center']}>
									<PlayerFace name={open.displayName} imageUrl={open.iconUrl} size="lg" />
									<div class="min-w-0">
										<p class={['truncate font-semibold', details ? 'text-2xl' : 'text-3xl']}>{open.displayName}</p>
										<p class="mt-1 text-base font-semibold opacity-70 tabular-nums">MMR {formatMmr(open.mmr[mainLane])}</p>
									</div>
								</div>
								{#if profile && !details}
									<div class="grid grid-cols-3 gap-px bg-border">
										{#each [['승률', winRate(profile.summary.games, profile.summary.wins)], ['승패', `${profile.summary.wins}-${profile.summary.losses}`], ['최근', `${recentWins}승 ${profile.recentGames.length - recentWins}패`]] as [label, value] (label)}
											<div class="bg-bg-surface px-3 py-2 text-center dark:bg-bg-surface-dark">
												<p class="text-[0.6875rem] opacity-60">{label}</p>
												<p class="mt-1 text-base font-semibold">{value}</p>
											</div>
										{/each}
									</div>
								{/if}
							</div>
							{#if details && profile}
								<AuctionTargetProfile player={open} {profile} />
							{/if}
						{:else}
							<div class="flex min-h-80 flex-1 flex-col items-center justify-center gap-1 border border-dashed border-border px-4 text-center">
								<p class="font-semibold opacity-70">후보 대기</p>
								<p class="text-sm opacity-60">
									{auction.queue.length ? '다음 후보를 뽑아 입찰을 시작해요' : '대기 후보가 없어요. 후보 목록에서 유찰 후보를 배치하거나 다시 올려 주세요'}
								</p>
							</div>
						{/if}
					</div>
					{#if controls && open}
						<!-- 유찰은 현재 매물 칸 하단에 고정해 카드 길이와 상관없이 같은 자리에 둔다. -->
						<div class="flex justify-end px-3 pb-3">
							<Button fill="textState" state="warning" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-sm" disabled={busy} onclick={() => run('pass')}>유찰</Button>
						</div>
					{/if}
				</section>

				<!-- 후보 현황 -->
				<section aria-labelledby="candidates" class="flex flex-col gap-3 bg-bg-surface p-3 dark:bg-bg-surface-dark">
					<div class="flex items-center justify-between">
						<h3 id="candidates" class="text-base font-semibold">후보 현황</h3>
						<span class="text-xs opacity-60 tabular-nums">{(open ? 1 : 0) + auction.queue.length + auction.unsold.length}명</span>
					</div>
					<div class={['grid gap-1.5', controls ? 'sm:grid-cols-3' : 'grid-cols-1']}>
						<Button fill="lineLight" size="full" heightOut="0" heightIn="2" injClass="text-sm" onclick={() => (listOpen = true)}>후보 목록</Button>
						{#if controls}
							<Button fill="lineLight" size="full" heightOut="0" heightIn="2" injClass="text-sm" disabled={busy || auction.queue.length < 2} onclick={() => run('shuffle')}>순서 섞기</Button>
							<Button fill="lineLight" state="error" size="full" heightOut="0" heightIn="2" injClass="text-sm" disabled={busy || !canRevert} onclick={reset}>초기화</Button>
						{/if}
					</div>
					<div class="grid grid-cols-3 gap-px bg-border text-center">
						{#each [['현재', open ? 1 : 0, 'text-primary dark:text-dark'], ['대기', auction.queue.length, ''], ['유찰 후보', auction.unsold.length, 'text-warning']] as [label, value, tone] (label)}
							<div class="bg-bg-surface p-2 dark:bg-bg-surface-dark">
								<p class="text-[0.6875rem] opacity-60">{label}</p>
								<p class={['mt-1 text-sm font-semibold tabular-nums', tone]}>{value}</p>
							</div>
						{/each}
					</div>
				</section>
			</div>
		{/if}

		<!-- 팀 패널 -->
		<div class={['grid min-h-0 gap-px md:grid-cols-2', auction.teams.length > 2 && 'md:grid-rows-2']}>
			{#each auction.teams as team (team.id)}
				<AuctionTeamCard {team} bidding={controls && Boolean(open)} {busy} {drag} bind:bid={() => bids[team.id] ?? '', (value) => (bids[team.id] = value)} onaward={(price) => award(team.id, price)} />
			{/each}
		</div>
	</div>

	{#if auction.history.length}
		<Accordion items={[{ title: `경매 기록 (${auction.history.length})` }]} border="solid">
			{#snippet children()}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<caption class="sr-only">경매 기록</caption>
						<thead class="text-xs opacity-70">
							<tr>
								<th scope="col" class="py-2 text-right font-medium">순서</th>
								<th scope="col" class="px-3 py-2 text-left font-medium">후보</th>
								<th scope="col" class="px-3 py-2 text-left font-medium">결과</th>
								<th scope="col" class="px-3 py-2 text-left font-medium">팀</th>
								<th scope="col" class="py-2 text-right font-medium">가격</th>
							</tr>
						</thead>
						<tbody>
							{#each auction.history as entry (entry.id)}
								<tr class={['border-t border-border', entry.voided && 'opacity-50']}>
									<td class="py-2 text-right tabular-nums">{entry.order}</td>
									<td class={['px-3 py-2', entry.voided && 'line-through']}>{entry.displayName}</td>
									<td class="px-3 py-2">{RESULT[entry.result]}{entry.voided ? ' (되돌림)' : ''}</td>
									<td class="px-3 py-2">{entry.teamName ?? '-'}</td>
									<td class="py-2 text-right tabular-nums">{entry.price === null ? '-' : `${entry.price}P`}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/snippet}
		</Accordion>
	{/if}
</section>

{#if live}
	<CandidateListDialog
		bind:open={listOpen}
		{auction}
		{controls}
		{busy}
		onassign={(registrationId, teamId) => run('assign', { registrationId, teamId })}
		onrestore={(registrationId) => run('restore', { registrationId })}
	/>
{/if}
