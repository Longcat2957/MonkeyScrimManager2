<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Popup } from 'stdf';
	import ModalBoundary from '#lib/components/common/ModalBoundary.svelte';

	type Props = {
		open: boolean;
		title: string;
		onclose: () => void;
		closeDisabled?: boolean;
		children: Snippet;
		footer?: Snippet;
	};

	let { open, title, onclose, closeDisabled = false, children, footer }: Props = $props();
</script>

<ModalBoundary {open} {title} {onclose} {closeDisabled}>
	<Popup
		visible={open}
		position="center"
		size={0}
		mask={{ visible: false }}
		maskClosable={false}
		px="4"
		py="4"
		duration={0}
		outDuration={0}
	>
		<section class="task-dialog-panel">
			<h2 class="px-6 pt-6 pb-4 text-xl font-semibold">{title}</h2>
			<div class="min-h-0 overflow-y-auto px-6 pb-6">
				{@render children()}
			</div>
			{#if footer}
				<div class="shrink-0 border-t border-border px-6 py-4">
					{@render footer()}
				</div>
			{/if}
		</section>
	</Popup>
</ModalBoundary>

<style>
	.task-dialog-panel {
		display: flex;
		width: 100%;
		max-height: calc(100dvh - 2rem);
		flex-direction: column;
	}
</style>
