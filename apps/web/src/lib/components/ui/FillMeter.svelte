<script lang="ts">
	import { Progress } from 'stdf';

	let {
		current,
		total,
		label,
		compact = false
	}: {
		current: number;
		total: number;
		label: string;
		compact?: boolean;
	} = $props();

	// 정원이 0이면 비율을 만들지 않는다.
	const percent = $derived(total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
	const isFull = $derived(total > 0 && current >= total);
</script>

<!-- Progress는 진행률 role이 없으므로 숫자를 항상 함께 읽을 수 있게 둔다. -->
<div class="min-w-0">
	<div class="flex items-baseline justify-between gap-2">
		{#if !compact}<span class="text-caption text-muted">{label}</span>{/if}
		<span class="tabular text-caption {isFull ? 'font-semibold text-fg' : 'text-muted'}" aria-hidden="true">
			{current} / {total}
		</span>
	</div>
	<div class="mt-1" aria-hidden="true">
		<Progress percent={percent} height="1" percentPosition={null} />
	</div>
	<span class="sr-only">{label} {current}명 / {total}명</span>
</div>
