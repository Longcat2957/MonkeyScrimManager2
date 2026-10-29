<script lang="ts">
	import type { ScrimSummary } from '#lib/data/types.ts';
	import { formatDateTime } from '#lib/format.ts';
	import { FORMATION_LABEL } from '#lib/components/ui/status.ts';

	/*
	 * 내전 식별 정보. 제목·상태는 헤더와 "지금 줄"이 담당하므로 여기서는 사실만 나열한다.
	 */
	let { scrim }: { scrim: ScrimSummary } = $props();
</script>

<dl class="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-s text-muted">
	<div class="flex items-center gap-3">
		<dt class="sr-only">예정 시각</dt>
		<dd>{formatDateTime(scrim.expectedStartAt)}</dd>
	</div>
	<span class="text-faint" aria-hidden="true">·</span>
	<div class="flex items-center gap-3">
		<dt class="sr-only">규모</dt>
		<dd>{scrim.teamCount}팀 · {scrim.playingCapacity}인</dd>
	</div>
	<span class="text-faint" aria-hidden="true">·</span>
	<div class="flex items-center gap-3">
		<dt class="sr-only">편성 방식</dt>
		<dd>{scrim.formationMethod ? FORMATION_LABEL[scrim.formationMethod] : '편성 방식 미정'}</dd>
	</div>
	{#if scrim.isHardFearless}
		<span class="text-faint" aria-hidden="true">·</span>
		<div class="flex items-center gap-3">
			<dt class="sr-only">피어리스</dt>
			<dd>하드 피어리스</dd>
		</div>
	{/if}
</dl>
