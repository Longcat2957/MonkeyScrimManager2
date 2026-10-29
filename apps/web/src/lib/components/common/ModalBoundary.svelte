<script lang="ts">
	import { tick, type Snippet } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		onclose: () => void;
		closeDisabled?: boolean;
		children: Snippet;
	};

	let { open, title, onclose, closeDisabled = false, children }: Props = $props();
	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		const boundary = dialog;
		if (!open || !boundary) return;

		const previousFocus = document.activeElement;
		let cancelled = false;
		let opened = false;
		let previousOverflow = '';

		// Popup의 입력이 렌더링된 뒤 열어 브라우저가 첫 입력에 초점을 줄 수 있게 한다.
		void tick().then(() => {
			if (cancelled || !boundary.isConnected) return;
			previousOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			boundary.showModal();
			opened = true;
		});

		return () => {
			cancelled = true;
			if (!opened) return;

			boundary.close();
			document.body.style.overflow = previousOverflow;

			if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
				previousFocus.focus({ preventScroll: true });
				if (document.activeElement === previousFocus) return;
			}
			document.getElementById('main-content')?.focus({ preventScroll: true });
		};
	});

	function handleCancel(event: Event) {
		event.preventDefault();
		if (!closeDisabled) onclose();
	}
</script>

<dialog bind:this={dialog} aria-label={title} oncancel={handleCancel} class="modal-boundary">
	{@render children()}
</dialog>

<style>
	.modal-boundary {
		position: fixed;
		inset: 0;
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		outline: none;
		overflow: hidden;
		background: transparent;
		color: inherit;
	}

	.modal-boundary::backdrop {
		background: color-mix(in oklch, var(--color-bg-base-dark) 60%, transparent);
	}

	/* STDF 3의 중앙 Popup은 폭 옵션이 없어 공통 모달 경계에서 제한한다. */
	.modal-boundary > :global(.fixed) {
		width: 100%;
		max-width: var(--app-dialog-width);
		margin-inline: auto;
	}

	.modal-boundary > :global(.fixed > div) {
		max-height: 100%;
		overflow-y: auto;
	}
</style>
