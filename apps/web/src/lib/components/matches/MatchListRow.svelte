<script lang="ts">
	import DateBadge from '#lib/components/common/DateBadge.svelte';
	import LinkCell from '#lib/components/common/LinkCell.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { MATCH_STATUS } from '#lib/features/labels.ts';
	import type { MatchListItem } from '#lib/features/matches/types.ts';

	let { match, href, line = false }: { match: MatchListItem; href: string; line?: boolean } = $props();

	const status = $derived(MATCH_STATUS[match.status]);
	// 정상 종료한 시리즈만 승자를 표시한다. 중도 종료·진행 중에는 점수가 앞서도 승자가 아니다.
	const winner = $derived(
		match.status === 'completed' && match.scoreA !== match.scoreB ? (match.scoreA > match.scoreB ? 'a' : 'b') : null
	);
	// 좁은 화면에서 잘려도 BO 형식은 남도록 앞에 둔다. 날짜는 왼쪽 배지가 보여 준다.
	const meta = $derived(`BO${match.bestOf} · ${match.scrimTitle}`);
</script>

{#snippet team(name: string, side: 'a' | 'b')}
	<span class={['truncate', winner === side && 'font-semibold', winner && winner !== side && 'text-gray-500 dark:text-gray-400']}>
		{name}{#if winner === side}<span class="sr-only"> 승리</span>{/if}
	</span>
{/snippet}

<LinkCell {href} {line} subTitle={meta}>
	{#snippet leftChild()}
		<DateBadge iso={match.playedAt} emptyText="미확인" />
	{/snippet}
	{#snippet titleChild()}
		<!--
			점수는 항상 보이게 하고 팀 이름은 각각 줄인다.
			grid가 남는 폭을 두 이름에 고르게 나눠 짧은 이름은 끝까지 보이고 긴 이름만 줄어든다.
		-->
		<span class="grid grid-cols-[minmax(0,max-content)_auto_minmax(0,max-content)] items-baseline justify-start gap-1.5">
			{@render team(match.teamA, 'a')}
			<span class="shrink-0 font-semibold tabular-nums">{match.scoreA} : {match.scoreB}</span>
			{@render team(match.teamB, 'b')}
		</span>
	{/snippet}
	<!-- 최근 경기는 대부분 종료라 종료 태그는 구분에 도움이 되지 않는다. 진행 중·중도 종료·취소만 표시한다. -->
	{#snippet detailChild()}
		{#if match.status !== 'completed'}
			<StatusTag text={status.text} state={status.state} />
		{/if}
	{/snippet}
</LinkCell>
