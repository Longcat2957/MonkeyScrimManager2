<script lang="ts">
	import type { ScrimSummary } from '#lib/data/types.ts';
	import { formatDateTime } from '#lib/format.ts';
	import FillMeter from '#lib/components/ui/FillMeter.svelte';
	import StatusTag from '#lib/components/ui/StatusTag.svelte';
	import { FORMATION_LABEL, SCRIM_STATUS } from '#lib/components/ui/status.ts';

	let {
		scrim,
		href,
		promoted = false
	}: {
		scrim: ScrimSummary;
		href: string;
		/** 대표 내전: 목록 맨 위에서 한 번만 카드로 강조한다. */
		promoted?: boolean;
	} = $props();
</script>

<li>
	<a
		href={href}
		class="group block border-line transition-colors hover:border-line-strong focus-visible:outline-offset-4 {promoted
			? 'rounded-[var(--radius-box)] border bg-surface-card p-4'
			: 'border-b px-1 py-3 last:border-b-0'}"
	>
		<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
			<div class="min-w-0">
				{#if promoted}
					<p class="category-label">{SCRIM_STATUS[scrim.status].text}</p>
				{/if}
				<p class="truncate {promoted ? 'text-title-l' : 'text-title-m'}">{scrim.title}</p>
				<p class="mt-0.5 text-body-s text-muted">
					{formatDateTime(scrim.expectedStartAt)}
					<span class="mx-1 text-faint" aria-hidden="true">·</span>
					{scrim.formationMethod ? FORMATION_LABEL[scrim.formationMethod] : '편성 방식 미정'}
					{#if scrim.isHardFearless}
						<span class="mx-1 text-faint" aria-hidden="true">·</span>하드 피어리스
					{/if}
				</p>
			</div>

			<div class="flex items-center gap-4">
				<div class="w-28">
					<FillMeter
						current={scrim.selectedCount}
						total={scrim.playingCapacity}
						label="선발 인원"
						compact={promoted}
					/>
				</div>
				{#if !promoted}
					<StatusTag status={SCRIM_STATUS[scrim.status]} />
				{/if}
			</div>
		</div>

		{#if promoted}
			<p class="mt-3 text-body-s font-semibold text-muted group-hover:text-fg">내전 열기 <span aria-hidden="true">→</span></p>
		{/if}
	</a>
</li>
