<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	interface Column {
		label: string;
		align?: 'start' | 'end';
		width?: string;
		/** 좁은 화면의 카드 배치에서 숨길 열 */
		hideInStack?: boolean;
	}

	/*
	 * 의미 있는 표. 설치판 STDF에는 Table이 없으므로 native <table>을 쓰고,
	 * 반응형 재배치는 utilities.css의 `.data-table`이 담당한다.
	 * 행 셀에는 `data-label`을 반드시 준다.
	 */
	let {
		caption,
		columns,
		items,
		row
	}: {
		caption: string;
		columns: Column[];
		items: T[];
		row: Snippet<[item: T, index: number]>;
	} = $props();
</script>

<div class="data-table-container">
	<table class="data-table">
		<caption class="sr-only">{caption}</caption>
		<thead>
			<tr>
				{#each columns as column (column.label)}
					<th
						scope="col"
						style:width={column.width}
						class={[column.align === 'end' ? 'text-end' : '', column.hideInStack ? 'hide-in-stack' : '']}
					>
						{column.label}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each items as item, index (index)}
				{@render row(item, index)}
			{/each}
		</tbody>
	</table>
</div>
