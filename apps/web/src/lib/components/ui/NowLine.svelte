<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * "지금 줄": 현재 상태 한 문장과 다음 행동 하나.
	 * 목적지 이동은 헤더 레일이 담당하므로 여기에는 레일 목적지를 넣지 않는다.
	 */
	let {
		tone = 'info',
		statements,
		action
	}: {
		tone?: 'info' | 'warning' | 'success' | 'danger';
		statements: string;
		action?: Snippet;
	} = $props();

	const color = $derived(
		`var(${tone === 'warning' ? '--warning' : tone === 'success' ? '--success' : tone === 'danger' ? '--danger' : '--info'})`
	);
</script>

<div
	class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-box)] border border-line bg-surface-card px-4 py-3"
>
	<p class="flex items-center gap-2 text-body-s">
		<span class="size-2 shrink-0 rounded-full" style:background={color} aria-hidden="true"></span>
		{statements}
	</p>
	{#if action}
		<div class="flex shrink-0 items-center gap-2">{@render action()}</div>
	{/if}
</div>
