<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		href: string;
		title?: string;
		subTitle?: string;
		detail?: string;
		info?: string;
		// 마지막 행이 아니면 STDF Cell처럼 안쪽으로 들인 구분선을 그린다.
		line?: boolean;
		titleChild?: Snippet;
		leftChild?: Snippet;
		detailChild?: Snippet;
		infoChild?: Snippet;
	};

	let {
		href,
		title = '',
		subTitle = '',
		detail = '',
		info = '',
		line = false,
		titleChild,
		leftChild,
		detailChild,
		infoChild
	}: Props = $props();

	// 왼쪽 요소 유무에 따라 본문·오른쪽 열의 위치가 바뀐다.
	const col = $derived(leftChild ? { main: 'col-start-2', right: 'col-start-3' } : { main: 'col-start-1', right: 'col-start-2' });
</script>

<!--
	STDF Cell은 행 전체가 button이라 링크로 쓸 수 없다. 이동하는 행은 Cell과 같은 클래스로 만든 링크를 쓰고,
	STDF CellGroup 안에 두어 /me 등의 Cell 목록과 같은 모양을 유지한다.
	오른쪽 detail은 항상 제목 줄, info는 항상 부제 줄에 맞추도록 grid로 배치한다.
	오른쪽 칸은 flex로 두어 작은 글자가 부모 줄 높이를 물려받아 행이 커지지 않게 한다.
	CellGroup이 overflow-hidden이므로 포커스 표시는 행 안쪽에 그린다.
	relative는 행 안의 sr-only(absolute) 텍스트가 스크롤 영역 밖으로 빠져 문서 높이를 늘리지 않게 한다.
-->
<a
	{href}
	class="relative block bg-bg-surface px-3 no-underline hover:bg-text-primary/3 focus-visible:rounded-(--radius-box) focus-visible:-outline-offset-2 active:bg-text-primary/5 dark:bg-bg-surface-dark dark:hover:bg-text-dark/3 dark:active:bg-text-dark/5"
>
	<span
		class={[
			'grid w-full items-center gap-x-3 gap-y-0.5 py-4',
			leftChild ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
			line && 'border-b border-text-primary/5 dark:border-text-dark/5'
		]}
	>
		{#if leftChild}
			<span class="col-start-1 row-span-2 row-start-1 self-center">{@render leftChild()}</span>
		{/if}
		<span class={['row-start-1 truncate font-medium', col.main]}>
			{#if titleChild}{@render titleChild()}{:else}{title}{/if}
		</span>
		{#if detailChild || detail}
			<span class={['row-start-1 flex items-center justify-end', col.right]}>
				{#if detailChild}
					{@render detailChild()}
				{:else}
					<span class="text-gray-700 dark:text-gray-300">{detail}</span>
				{/if}
			</span>
		{/if}
		{#if subTitle}
			<span class={['row-start-2 truncate text-xs text-gray-500 dark:text-gray-400', col.main]}>{subTitle}</span>
		{/if}
		{#if infoChild || info}
			<span class={['row-start-2 flex items-center justify-end', col.right]}>
				{#if infoChild}
					{@render infoChild()}
				{:else}
					<span class="text-xs font-light text-gray-500 dark:text-gray-400">{info}</span>
				{/if}
			</span>
		{/if}
	</span>
</a>
