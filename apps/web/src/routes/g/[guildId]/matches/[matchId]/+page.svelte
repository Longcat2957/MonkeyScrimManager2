<script lang="ts">
	import { resolve } from '$app/paths';
	import { Accordion } from 'stdf';
	import { formatDateTime, formatNumber } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { MATCH_STATUS, POSITION_LABEL } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const detail = $derived(data.detail);
	const game = $derived(detail.games.find((candidate) => candidate.id === data.selectedGameId) ?? null);

	// 하드 피어리스: 선택한 경기보다 앞선 완료 경기에서 실제로 사용한 챔피언만 안내한다.
	const fearlessUsed = $derived(
		game
			? detail.games
					.filter((candidate) => candidate.number < game.number && candidate.status === 'completed')
					.flatMap((candidate) => candidate.participants.map((line) => line.champion))
			: []
	);

	// 블루 5명 → 레드 5명. 포지션 순서는 서비스 전체가 같다.
	const lines = $derived(
		game ? [...game.participants].sort((a, b) => (a.side === b.side ? 0 : a.side === 'blue' ? -1 : 1)) : []
	);

	const columns = [
		{ label: '선수' },
		{ label: '챔피언' },
		{ label: '포지션', hideInStack: true },
		{ label: 'K / D / A' },
		{ label: 'CS', align: 'end' as const },
		{ label: '골드', align: 'end' as const, hideInStack: true },
		{ label: '시야', align: 'end' as const, hideInStack: true }
	];

	const scrimHref = $derived(
		resolve('/g/[guildId]/scrims/[scrimId]', { guildId: guild.id, scrimId: detail.scrimId })
	);
	const title = $derived(pageTitle(`${detail.teamA.name} vs ${detail.teamB.name}`, guild.name));
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="mb-3">
	<a href={scrimHref} class="inline-flex min-h-11 items-center text-[13px] text-mut hover:text-fg">
		← {detail.scrimTitle}
	</a>
</div>

<PageHeader title={`${detail.teamA.name} vs ${detail.teamB.name}`} />

<!-- 시리즈 요약: 점수는 숫자만, 팀 이름은 제목이 이미 말한다. -->
<div class="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
	<div class="flex items-end gap-3">
		<span class="pb-1.5 text-[12px] font-semibold text-mut">{detail.teamA.name}</span>
		<span class="numeric-display text-[2.75rem] leading-none">{detail.score[0]}</span>
		<span class="pb-1.5 text-[1.25rem] text-faint" aria-hidden="true">:</span>
		<span class="numeric-display text-[2.75rem] leading-none">{detail.score[1]}</span>
		<span class="pb-1.5 text-[12px] font-semibold text-mut">{detail.teamB.name}</span>
		<span class="sr-only">{detail.teamA.name} {detail.score[0]} 대 {detail.score[1]}</span>
	</div>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-mut">
		<span>BO{detail.bestOf}</span>
		<span aria-hidden="true">·</span>
		<span>{formatDateTime(detail.playedAt)}</span>
		<StatusState status={MATCH_STATUS[detail.status]} />
		{#if detail.isHardFearless}
			<span class="state state--wait"><i aria-hidden="true"></i>하드 피어리스</span>
		{/if}
	</div>
</div>

{#if detail.games.length === 0}
	<p class="panel mt-6 px-5 py-6 text-[13px] text-mut">아직 등록된 경기가 없습니다.</p>
{:else}
	<!-- Game 선택: 각 경기는 서로 다른 주소다. -->
	<nav aria-label="경기 선택" class="mt-6 flex gap-2 overflow-x-auto pb-1">
		{#each detail.games as item (item.id)}
			<a
				href="?game={item.id}"
				aria-current={item.id === game?.id ? 'page' : undefined}
				class="chip"
			>
				{item.number}경기
			</a>
		{/each}
	</nav>
	{#if data.invalidSelection}
		<p class="mt-2 text-[11.5px] text-gold">요청한 경기를 찾을 수 없어 다른 경기를 표시합니다.</p>
	{/if}

	{#if game}
		<section class="mt-5" aria-labelledby="game-title">
			<div class="region">
				<span class="lbl" id="game-title">{game.number}경기 성적</span>
				<span class="count">
					{game.blueTeam.name} 블루 · {game.redTeam.name} 레드
					{#if game.winnerSide}
						· {game.winnerSide === 'blue' ? game.blueTeam.name : game.redTeam.name} 승리
					{/if}
				</span>
			</div>

			<div class="panel px-5 py-2">
				<div class="data-table-container">
					<table class="data-table">
						<caption class="sr-only">{game.number}경기 성적</caption>
						<thead>
							<tr>
								{#each columns as column (column.label)}
									<th scope="col" class={column.align === 'end' ? 'text-end' : undefined} class:hide-in-stack={column.hideInStack}>
										{column.label}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each lines as line, index (line.participantId)}
								{@const previous = index === 0 ? null : lines[index - 1]}
								{#if !previous || previous.side !== line.side}
									<tr>
										<th colspan={columns.length} scope="colgroup" class="pt-3 text-left text-[11px] font-semibold text-mut">
											{line.side === 'blue' ? `${game.blueTeam.name} · 블루` : `${game.redTeam.name} · 레드`}
											{#if game.winnerSide === line.side}
												<span class="ml-2 text-accent">승리</span>
											{/if}
										</th>
									</tr>
								{/if}
								<tr>
									<th scope="row">{line.player.displayName}</th>
									<td data-label="챔피언">{line.champion}</td>
									<td data-label="포지션" class="hide-in-stack">{POSITION_LABEL[line.position]}</td>
									<td data-label="K / D / A" class="tabular">{line.kills} / {line.deaths} / {line.assists}</td>
									<td data-label="CS" class="tabular text-end">{line.cs}</td>
									<td data-label="골드" class="tabular hide-in-stack text-end">{formatNumber(line.gold)}</td>
									<td data-label="시야" class="tabular hide-in-stack text-end">{line.vision}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</section>

		{#if detail.isHardFearless}
			<section class="mt-6" aria-labelledby="fearless">
				<h2 id="fearless" class="sr-only">하드 피어리스 사용 챔피언</h2>
				<Accordion
					items={[
						{
							title: '하드 피어리스 사용 챔피언',
							content: fearlessUsed.length > 0 ? '' : '앞선 경기에서 사용한 챔피언이 없습니다.'
						}
					]}
					expandIcon="plus"
				>
					{#snippet children()}
						{#if fearlessUsed.length > 0}
							<ul class="flex flex-wrap gap-2">
								{#each [...new Set(fearlessUsed)] as champion (champion)}
									<li class="border border-line px-2.5 py-1 text-[12px] text-mut">{champion}</li>
								{/each}
							</ul>
						{/if}
					{/snippet}
				</Accordion>
			</section>
		{/if}
	{/if}
{/if}
