<script lang="ts">
	let {
		items,
		columns = 'auto'
	}: {
		items: { label: string; value: string; unit?: string; hint?: string }[];
		/** auto: 화면 폭에 따라 2~4열, grid-2/grid-4: 고정 */
		columns?: 'auto' | 'grid-2' | 'grid-4';
	} = $props();
</script>

<!-- 수치는 카드가 아니라 정의 목록으로 읽는다. 값은 항상 tabular로 정렬한다. -->
<dl class="grid gap-x-6 gap-y-3 {columns === 'grid-2' ? 'grid-cols-2' : columns === 'grid-4' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}">
	{#each items as item (item.label)}
		<div class="min-w-0">
			<dt class="text-caption text-muted">{item.label}</dt>
			<dd class="tabular mt-0.5 text-title-m">
				{item.value}{#if item.unit}<span class="ml-0.5 text-body-s font-normal text-muted">{item.unit}</span>{/if}
			</dd>
			{#if item.hint}<dd class="text-caption text-faint">{item.hint}</dd>{/if}
		</div>
	{/each}
</dl>
