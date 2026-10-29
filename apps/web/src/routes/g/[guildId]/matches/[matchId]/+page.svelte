<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateTime, formatNumber } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import DataTable from '#lib/components/ui/DataTable.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import StatusTag from '#lib/components/ui/StatusTag.svelte';
	import { MATCH_STATUS, POSITION_LABEL } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const detail = $derived(data.detail);
	const game = $derived(detail.games.find((candidate) => candidate.id === data.selectedGameId) ?? null);

	// 블루 5명 → 레드 5명. 포지션 순서는 서비스 전체가 같다.
		// 하드 피어리스: 선택한 경기보다 앞선 완료 경기에서 실제로 사용한 챔피언만 안내한다.
	const fearlessUsed = $derived(
		game
			? detail.games
					.filter((candidate) => candidate.number < game.number && candidate.status === 'completed')
					.flatMap((candidate) => candidate.participants.map((line) => line.champion))
			: []
	);

	const lines = $derived(
		game
			? [...game.participants].sort(
					(a, b) => (a.side === b.side ? 0 : a.side === 'blue' ? -1 : 1)
				)
			: []
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
	const gameHref = (gameId: string) => `?game=${gameId}`;

	const title = $derived(pageTitle(`${detail.teamA.name} vs ${detail.teamB.name}`, guild.name));
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="mb-2">
	<!-- 소속 내전으로 돌아가는 링크 한 곳 -->
	<a href={scrimHref} class="inline-flex min-h-11 items-center text-body-s text-muted underline-offset-4 hover:text-fg hover:underline">
		← {detail.scrimTitle}
	</a>
</div>

<PageHeader title={`${detail.teamA.name} vs ${detail.teamB.name}`} />

<div class="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
	<div class="flex min-w-0 items-center gap-4">
		<span class="min-w-0 truncate text-title-l">{detail.teamA.name}</span>
		<span class="numeric-display shrink-0 text-display-l" aria-hidden="true">{detail.score[0]}</span>
		<span class="text-title-l text-faint" aria-hidden="true">:</span>
		<span class="numeric-display shrink-0 text-display-l" aria-hidden="true">{detail.score[1]}</span>
		<span class="min-w-0 truncate text-title-l">{detail.teamB.name}</span>
		<span class="sr-only">시리즈 점수 {detail.teamA.name} {detail.score[0]} 대 {detail.score[1]}</span>
	</div>
	<div class="flex flex-wrap items-center gap-2 text-body-s text-muted">
		<span>BO{detail.bestOf}</span>
		<span class="text-faint" aria-hidden="true">·</span>
		<span>{formatDateTime(detail.playedAt)}</span>
		<StatusTag status={MATCH_STATUS[detail.status]} />
		{#if detail.isHardFearless}
			<StatusTag status={{ text: '하드 피어리스', tone: 'neutral' }} />
		{/if}
	</div>
</div>

{#if detail.games.length === 0}
	<p class="mt-8 text-body-s text-muted">아직 등록된 경기가 없습니다.</p>
{:else}
	<!-- Game 선택: 각 경기는 다른 결과를 가진 링크다. -->
	<nav aria-label="경기 선택" class="mt-8">
		<ul class="flex gap-2 overflow-x-auto">
			{#each detail.games as item (item.id)}
				<li class="shrink-0">
					<a
						href={gameHref(item.id)}
						aria-current={item.id === game?.id ? 'page' : undefined}
						class="flex min-h-11 items-center rounded-full border px-4 text-body-s transition-colors {item.id ===
						game?.id
							? 'border-action bg-surface-raised font-semibold text-fg'
							: 'border-line text-muted hover:border-line-strong'}"
					>
						{item.number}경기
					</a>
				</li>
			{/each}
		</ul>
		{#if data.invalidSelection}
			<p class="mt-2 text-caption" style:color="var(--warning)">요청한 경기를 찾을 수 없어 다른 경기를 표시합니다.</p>
		{/if}
	</nav>

	{#if game}
		<section class="mt-6" aria-labelledby="game-title">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="game-title" class="text-title-l">{game.number}경기</h2>
				<p class="flex flex-wrap items-center gap-2 text-body-s text-muted">
					<span>{game.blueTeam.name} 블루</span>
					<span class="text-faint" aria-hidden="true">·</span>
					<span>{game.redTeam.name} 레드</span>
					<span class="text-faint" aria-hidden="true">·</span>
					<span>
						{game.winnerSide === 'blue'
							? `${game.blueTeam.name} 승리`
							: game.winnerSide === 'red'
								? `${game.redTeam.name} 승리`
								: '결과 대기'}
					</span>
					{#if game.durationMs !== null}
						<span class="text-faint" aria-hidden="true">·</span>
						<span>{Math.floor(game.durationMs / 60000)}분</span>
					{/if}
				</p>
			</div>

			<div class="mt-3 border-t border-line pt-2">
				<DataTable caption={`${game.number}경기 성적`} {columns} items={lines}>
					{#snippet row(line, index)}
						{@const previous = index === 0 ? null : lines[index - 1]}
						{#if !previous || previous.side !== line.side}
							<tr>
								<th
									colspan={columns.length}
									scope="colgroup"
									class="pt-3 pb-1 text-left text-caption font-semibold text-muted"
								>
									{line.side === 'blue' ? `${game.blueTeam.name} · 블루` : `${game.redTeam.name} · 레드`}
									{#if game.winnerSide === line.side}
										<span class="ml-2" style:color="var(--success)">승리</span>
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
					{/snippet}
				</DataTable>
			</div>
		</section>

		{#if detail.isHardFearless && fearlessUsed.length > 0}
			<section class="mt-8" aria-labelledby="fearless">
				<h2 id="fearless" class="text-title-l">하드 피어리스 사용 챔피언</h2>
				<p class="mt-1 text-body-s text-muted">이 시리즈의 앞선 Game에서 실제로 사용한 챔피언입니다. 이후 경기에서 다시 사용할 수 없습니다.</p>
				<ul class="mt-2 flex flex-wrap gap-2">
					{#each [...new Set(fearlessUsed)] as champion (champion)}
						<li class="rounded-full border border-line px-3 py-1 text-body-s">{champion}</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
{/if}
