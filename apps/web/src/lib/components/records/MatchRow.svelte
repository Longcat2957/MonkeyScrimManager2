<script lang="ts">
	import type { MatchSummary } from '#lib/data/types.ts';
	import { formatDateTime } from '#lib/format.ts';
	import StatusTag from '#lib/components/ui/StatusTag.svelte';
	import { MATCH_STATUS } from '#lib/components/ui/status.ts';

	let { match, href }: { match: MatchSummary; href: string } = $props();

	// 점수의 크기만으로 승자를 추정하지 않는다. 상태는 문구로 표시한다.
</script>

<li>
	<a
		href={href}
		class="grid gap-x-4 gap-y-1 border-b border-line px-1 py-3 last:border-b-0 hover:bg-surface-raised focus-visible:outline-offset-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
	>
		<div class="flex min-w-0 items-baseline gap-3">
			<span class="min-w-0 truncate text-title-m">{match.teamA.name}</span>
			<span class="sr-only">시리즈 점수 {match.teamA.name} {match.score[0]} 대 {match.score[1]}</span>
			<span class="numeric-display shrink-0 text-title-l text-muted" aria-hidden="true">
				{match.score[0]}<span class="mx-1 text-body-s text-faint">:</span>{match.score[1]}
			</span>
			<span class="min-w-0 truncate text-title-m">{match.teamB.name}</span>
		</div>

		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-s text-muted sm:justify-end">
			<span class="truncate">{match.scrimTitle}</span>
			<span class="text-faint" aria-hidden="true">·</span>
			<span>BO{match.bestOf}</span>
			<span class="text-faint" aria-hidden="true">·</span>
			<span>{formatDateTime(match.playedAt)}</span>
			<StatusTag status={MATCH_STATUS[match.status]} />
		</div>
	</a>
</li>
