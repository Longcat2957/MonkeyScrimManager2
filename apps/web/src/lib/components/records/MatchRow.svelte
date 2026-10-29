<script lang="ts">
	import type { MatchSummary } from '#lib/data/types.ts';
	import { formatDateTime } from '#lib/format.ts';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { MATCH_STATUS } from '#lib/components/ui/status.ts';

	let { match, href }: { match: MatchSummary; href: string } = $props();

	// 점수의 크기만으로 승자를 추정하지 않는다. 상태는 문구로 표시한다.
</script>

<a {href} class="match-row">
	<span class="team">{match.teamA.name}</span>
	<span class="scorebox" aria-hidden="true">{match.score[0]} : {match.score[1]}</span>
	<span class="sr-only">{match.teamA.name} {match.score[0]} 대 {match.score[1]} {match.teamB.name}</span>
	<span class="team team-right">{match.teamB.name}</span>
	<span class="match-info">
		<span><b>{match.scrimTitle}</b></span>
		<span class="flex items-center gap-1.5">{formatDateTime(match.playedAt)}<StatusState status={MATCH_STATUS[match.status]} /></span>
	</span>
</a>
