<script lang="ts">
	import { scheduleParts } from '#lib/features/labels.ts';

	// 날짜가 없으면 emptyText를 점선 상자로 표시한다. 예: 일정 미정, 경기 시각 미확인
	let { iso, emptyText }: { iso: string | null; emptyText: string } = $props();

	const parts = $derived(iso ? scheduleParts(iso) : null);
</script>

{#if parts}
	<span
		class="flex size-11 shrink-0 flex-col items-center justify-center rounded-(--radius-form) bg-bg-highlight leading-none dark:bg-bg-highlight-dark"
	>
		<span class="text-[0.6875rem] opacity-70">{parts.month}월</span>
		<span class="mt-1 text-base font-semibold tabular-nums">{parts.day}<span class="sr-only">일</span></span>
	</span>
{:else}
	<span
		class="flex size-11 shrink-0 items-center justify-center rounded-(--radius-form) border border-dashed border-border text-[0.6875rem] opacity-70"
	>
		{emptyText}
	</span>
{/if}
