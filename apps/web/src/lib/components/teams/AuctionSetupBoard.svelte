<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Input, toast } from 'stdf';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import PositionIcon from '#lib/components/common/PositionIcon.svelte';
	import { POSITIONS } from '#lib/features/labels.ts';
	import { bestMmr, formatMmr, type AuctionTeamView, type FormationPlayer } from '#lib/features/scrims/formation.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';

	type Props = {
		teams: AuctionTeamView[];
		players: FormationPlayer[];
		editable: boolean;
	};

	let { teams, players, editable }: Props = $props();

	// 팀 순서대로의 팀장과 시작 포인트 입력값이다. 저장된 값이 바뀌면 다시 맞춘다.
	const fromTeams = () => ({
		captains: teams.map((team) => team.captainId),
		points: teams.map((team) => String(team.startPoints))
	});
	let captains = $state<(string | null)[]>(untrack(() => fromTeams().captains));
	let points = $state<string[]>(untrack(() => fromTeams().points));
	let query = $state('');
	let busy = $state(false);

	$effect(() => {
		const next = fromTeams();
		untrack(() => {
			captains = next.captains;
			points = next.points;
		});
	});

	const parsed = $derived(points.map((value) => (/^\d+$/.test(value.trim()) && Number(value) > 0 ? Number(value) : null)));
	const dirty = $derived(teams.some((team, index) => team.captainId !== captains[index] || team.startPoints !== parsed[index]));
	const missingCaptain = $derived(captains.some((id) => !id));
	const invalidPoints = $derived(parsed.some((value) => value === null));
	const startBlocked = $derived(
		missingCaptain ? '모든 팀의 팀장을 정해야 해요' : invalidPoints ? '시작 포인트는 1 이상의 정수여야 해요' : dirty ? '설정을 저장해야 시작할 수 있어요' : null
	);
	const filtered = $derived.by(() => {
		const keyword = query.trim().toLocaleLowerCase('ko-KR');
		return keyword ? players.filter((player) => player.displayName.toLocaleLowerCase('ko-KR').includes(keyword)) : players;
	});
	const laneText = (key: string) => POSITIONS.find((position) => position.key === key)?.text ?? key;
	const playerOf = (id: string | null) => players.find((player) => player.registrationId === id) ?? null;

	// 누르는 순서대로 비어 있는 첫 팀의 팀장이 되고, 다시 누르면 해제된다.
	function toggleCaptain(id: string) {
		const index = captains.indexOf(id);
		if (index >= 0) captains[index] = null;
		else {
			const empty = captains.indexOf(null);
			if (empty >= 0) captains[empty] = id;
		}
	}

	async function save() {
		busy = true;
		const message = await postAction('setup', {
			teams: JSON.stringify(captains.map((captainId, index) => ({ captainId, startPoints: parsed[index] })))
		});
		busy = false;
		if (message) toast.error(message);
	}

	async function start() {
		if (!(await confirm('시작하면 팀장과 시작 포인트를 바꿀 수 없어요. 시작할까요?', '경매 시작'))) return;
		busy = true;
		const message = await postAction('start', {});
		busy = false;
		if (message) toast.error(message);
	}
</script>

<!-- 경매 준비 작업판: 왼쪽 팀장 고르기, 오른쪽 팀별 시작 설정과 하단 실행 줄. 1px 경계로 붙는다. -->
<section
	aria-labelledby="auction-setup"
	aria-busy={busy}
	class={['grid w-full min-w-0 gap-px overflow-hidden rounded-(--radius-box) border border-border bg-border', editable && 'xl:h-[min(42rem,calc(100dvh-14rem))] xl:min-h-[32rem] xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]']}
>
	{#if editable}
		<!-- 선발 참가자 목록. 누르면 순서대로 비어 있는 팀의 팀장이 되고, 다시 누르면 해제된다. -->
		<section aria-labelledby="captain-candidates" class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-bg-surface dark:bg-bg-surface-dark">
			<div class="border-b border-border px-3 py-3">
				<h3 id="captain-candidates" class="sr-only">팀장 고르기</h3>
				<Input type="search" placeholder="참가자 검색" bind:value={query} clear />
			</div>
			<ul class="flex max-h-[28rem] min-h-0 flex-col gap-1.5 overflow-y-auto p-2 xl:max-h-none">
				{#each filtered as player (player.registrationId)}
					{@const order = captains.indexOf(player.registrationId)}
					<li>
						<button
							type="button"
							aria-pressed={order >= 0}
							disabled={order < 0 && !captains.includes(null)}
							class={[
								'grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border px-2 py-2 text-left transition disabled:opacity-40',
								order >= 0 ? 'border-warning/40 bg-warning/10' : 'border-transparent bg-bg-highlight/30 hover:border-primary/25 hover:bg-primary/5 dark:bg-bg-highlight-dark/30'
							]}
							onclick={() => toggleCaptain(player.registrationId)}
						>
							<PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="md" />
							<span class="min-w-0">
								<span class="block truncate text-base font-semibold">{player.displayName}</span>
								<span class="block truncate text-xs opacity-60">희망 · {player.positions.map(laneText).join(' · ')} · MMR {formatMmr(bestMmr(player))}</span>
							</span>
							<span class="grid min-w-16 justify-items-end gap-1">
								{#if player.positions[0]}<PositionIcon position={player.positions[0]} size="sm" />{/if}
								<span class={['text-xs font-semibold', order >= 0 ? 'text-warning' : 'opacity-50']}>
									{order >= 0 ? `${teams[order]?.name} 팀장` : '후보'}
								</span>
							</span>
						</button>
					</li>
				{:else}
					<li class="px-3 py-10 text-center text-sm opacity-60">검색 결과가 없어요</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-bg-surface dark:bg-bg-surface-dark">
		<div class="border-b border-border px-4 py-3">
			<h2 id="auction-setup" class="text-base font-semibold">경매 준비</h2>
			{#if editable}
				<p class="mt-1 text-xs opacity-60">{startBlocked ?? '설정이 완성됐어요. 시작하면 팀장과 시작 포인트를 바꿀 수 없어요.'}</p>
			{/if}
		</div>
		<div class="grid min-h-0 content-start gap-2 overflow-y-auto p-3 md:grid-cols-2">
			{#each teams as team, index (team.id)}
				{@const captain = playerOf(captains[index] ?? null)}
				<section aria-labelledby={`setup-${team.id}`} class="grid grid-rows-[auto_minmax(0,1fr)] gap-4 border border-border bg-bg-highlight/20 p-4 dark:bg-bg-highlight-dark/20">
					<div class="grid gap-2">
						<h3 id={`setup-${team.id}`} class="text-base font-semibold text-primary dark:text-dark">{team.name}</h3>
						{#if editable}
							<Input
								title="시작 포인트"
								titlePosition="out"
								inputmode="numeric"
								placeholder="1000"
								bind:value={points[index]}
								state={parsed[index] === null ? 'error' : 'theme'}
								tip={parsed[index] === null ? '1 이상의 정수를 입력해 주세요' : null}
							/>
						{:else}
							<p class="text-sm"><span class="opacity-60">시작 포인트</span> <span class="font-semibold tabular-nums">{team.startPoints}P</span></p>
						{/if}
					</div>
					{#if captain}
						<div class="flex min-h-0 items-center gap-3">
							<PlayerFace name={captain.displayName} imageUrl={captain.iconUrl} size="lg" />
							<div class="min-w-0">
								<p class="truncate text-xl font-semibold">{captain.displayName}</p>
								<p class="mt-1 truncate text-sm opacity-60">희망 · {captain.positions.map(laneText).join(' · ')}</p>
							</div>
						</div>
					{:else}
						<p class="flex min-h-20 items-center justify-center border border-dashed border-border text-sm font-semibold opacity-60">팀장 미지정</p>
					{/if}
				</section>
			{/each}
		</div>
		{#if editable}
			<div class="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
				<Button fill="lineLight" size="full" heightOut="0" heightIn="3" injClass="text-sm" disabled={!dirty || invalidPoints || busy} loading={busy && dirty ? {} : null} onclick={save}>
					{dirty ? '설정 저장' : missingCaptain ? '설정 대기' : '저장됨'}
				</Button>
				<Button size="full" heightOut="0" heightIn="3" injClass="text-sm" disabled={Boolean(startBlocked) || busy} onclick={start}>경매 시작</Button>
			</div>
		{/if}
	</section>
</section>
