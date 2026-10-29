<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * STDF가 지원하지 않는 입력(select·number·datetime-local·checkbox)을 위한 라벨 묶음.
	 * 라벨·힌트·오류를 실제 입력과 id/aria-describedby로 연결한다.
	 */
	let {
		id,
		label,
		hint,
		error,
		children
	}: {
		id: string;
		label: string;
		hint?: string;
		error?: string;
		/** 넘겨받은 값을 aria-describedby로 연결한다. */
		children: Snippet<[string]>;
	} = $props();

	const hintId = $derived(hint ? `${id}-hint` : '');
	const errorId = $derived(error ? `${id}-error` : '');
	const describedBy = $derived([hintId, errorId].filter(Boolean).join(' ') || undefined);
</script>

<div class="space-y-1">
	<label for={id} class="block text-body-s font-semibold">{label}</label>
	{@render children(describedBy ?? '')}
	{#if hint}<p id={hintId} class="text-caption text-muted">{hint}</p>{/if}
	{#if error}<p id={errorId} class="text-caption" style:color="var(--danger)">{error}</p>{/if}
</div>
