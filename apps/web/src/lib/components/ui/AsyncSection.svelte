<script lang="ts" generics="T">
	import { Skeleton, Button } from 'stdf';
	import type { Snippet } from 'svelte';
	import type { Loadable } from '#lib/data/types.ts';

	/*
	 * 비동기 영역의 표시 규칙을 한 곳으로 모은다.
	 * - 로딩: 실제 레이아웃 모양의 스켈레톤
	 * - 빈 데이터: 짧은 문장 한 개(같은 동작의 버튼을 다시 만들지 않는다)
	 * - 오류: 이유와 재시도 한 곳
	 */
	let {
		result,
		label,
		emptyText,
		isEmpty,
		loading = false,
		onretry,
		children
	}: {
		result: Loadable<T> | null;
		label: string;
		emptyText: string;
		/** 목록이 아닌 값의 빈 상태 판정. 기본은 배열 길이 0이다. */
		isEmpty?: (data: T) => boolean;
		loading?: boolean;
		onretry?: () => void;
		children: Snippet<[T]>;
	} = $props();

	const state = $derived.by(() => {
		if (loading || result === null) return 'loading';
		if (result.status === 'error') return 'error';
		const empty = isEmpty ? isEmpty(result.data) : Array.isArray(result.data) && result.data.length === 0;
		return empty ? 'empty' : 'ready';
	});
</script>

<section aria-label={label} aria-busy={state === 'loading'}>
	{#if state === 'loading'}
		<div class="space-y-2">
			{#each [0, 1, 2] as line (line)}
				<Skeleton type="p" width="full" height="4" />
			{/each}
		</div>
		<p class="sr-only" role="status">불러오는 중</p>
	{:else if state === 'error'}
		<div class="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line px-4 py-3">
			<p class="text-body-s text-muted">{result?.status === 'error' ? result.message : '불러오지 못했어요.'}</p>
			{#if onretry}
				<Button size="auto" injClass="px-4" fill="line" onclick={onretry}>다시 시도</Button>
			{/if}
		</div>
	{:else if state === 'empty'}
		<p class="py-2 text-body-s text-muted">{emptyText}</p>
	{:else if result?.status === 'ready'}
		{@render children(result.data)}
	{/if}
</section>
