<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from 'stdf';
	import type { ActionProps } from 'stdf';
	import ActionMenu from '#lib/components/common/ActionMenu.svelte';

	type Props = {
		label: string;
		actions: ActionProps[];
		onselect: (index: number) => void;
		children: Snippet;
	};

	let { label, actions, onselect, children }: Props = $props();
	let open = $state(false);
	let trigger: HTMLElement | null = $state(null);
</script>

<span bind:this={trigger} class="inline-flex">
	<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-2" onclick={() => (open = !open)}>
		{@render children()}
	</Button>
</span>
<ActionMenu bind:open {label} {actions} {trigger} {onselect} />
