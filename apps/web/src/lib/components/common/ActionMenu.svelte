<script lang="ts">
	import { onMount } from 'svelte';
	import { ActionPopover, ActionSheet } from 'stdf';
	import type { ActionProps } from 'stdf';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	type Props = {
		open: boolean;
		label: string;
		actions: ActionProps[];
		// 데스크톱에서 메뉴를 붙일 요소. 모바일은 하단 시트로 열리므로 쓰지 않는다.
		trigger: HTMLElement | null;
		onselect: (index: number) => void;
	};

	let { open = $bindable(false), label, actions, trigger, onselect }: Props = $props();

	// STDF ActionPopover는 초기화 중 document를 읽으므로 SSR에서는 렌더링하지 않는다.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

<!-- ActionPopover는 trigger 기준 inline 메뉴만 지원하므로 모바일은 ActionSheet로 같은 항목을 연다. -->
<!--
	데스크톱 메뉴 보정:
	- 버튼 기본 text-align이 center라 설명이 있는 항목만 제목이 가운데로 가므로 왼쪽으로 맞춘다.
	- STDF는 설명이 있는 항목을 h-10으로 고정해 구분선이 설명에 붙으므로 높이를 내용에 맞추고 위아래 여백을 준다.
-->
<div
	class={desktop.current
		? '[&_button]:text-left [&_button>div]:h-auto [&_button>div]:min-h-12 [&_button>div]:gap-0.5 [&_button>div]:py-2.5'
		: undefined}
	{@attach overlay({ open, label, onclose: () => (open = false) })}
>
	{#if mounted && desktop.current}
		<ActionPopover
			bind:visible={open}
			{actions}
			triggerRef={trigger}
			align="left"
			inlineAlign="right"
			inlineDirection="down"
			showCancel={false}
			onclickAction={(index) => onselect(index)}
		/>
	{:else if mounted}
		<ActionSheet
			bind:visible={open}
			{actions}
			title={label}
			showCancel
			onclickAction={(index) => onselect(index)}
		/>
	{/if}
</div>
