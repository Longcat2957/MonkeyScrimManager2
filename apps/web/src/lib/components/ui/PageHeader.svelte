<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		kicker,
		description,
		actions
	}: {
		title: string;
		kicker?: string;
		/** 제목을 다시 말하지 않고, 현재 범위처럼 다른 정보를 더할 때만 쓴다. */
		description?: string;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-end justify-between gap-4">
	<div class="min-w-0">
		{#if kicker}<p class="lbl">{kicker}</p>{/if}
		<h1 class="page-title {kicker ? 'mt-1.5' : ''}">{title}</h1>
		{#if description}<p class="measure mt-1.5 text-[13px] text-mut">{description}</p>{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</div>
