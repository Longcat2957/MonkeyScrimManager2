<script lang="ts">
	import { Popup, Button } from 'stdf';
	import type { Snippet } from 'svelte';

	/*
	 * 서비스 입력 패널.
	 * 설치판 Popup에는 포커스 트랩·Escape·dialog 의미가 없으므로 이 컴포넌트가 한 곳에서 보완한다.
	 * 닫기 조작은 하단 한 곳이며, 처리 중에는 닫히지 않는다.
	 */
	let {
		open = $bindable(false),
		title,
		description,
		submitLabel,
		cancelLabel = '닫기',
		submitTone = 'theme',
		pending = false,
		submitError = null,
		canSubmit = true,
		onsubmit,
		onclosed,
		children,
		footer
	}: {
		open: boolean;
		title: string;
		description?: string;
		submitLabel: string;
		cancelLabel?: string;
		submitTone?: 'theme' | 'error';
		pending?: boolean;
		submitError?: string | null;
		canSubmit?: boolean;
		onsubmit: () => void;
		onclosed?: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const titleId = $props.id();

	let panel: HTMLDivElement | undefined = $state();
	let lastActive: HTMLElement | null = null;

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function focusables(root: HTMLElement): HTMLElement[] {
		return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(element) => element.offsetParent !== null || element === document.activeElement
		);
	}

	$effect(() => {
		if (!open) return;

		// 열기 전에 있던 조작으로 닫은 뒤 포커스를 돌려준다.
		lastActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

		const frame = requestAnimationFrame(() => {
			const first = panel ? focusables(panel)[0] : undefined;
			(first ?? panel)?.focus();
		});

		const onkeydown = (event: KeyboardEvent) => {
			if (!panel) return;
			if (event.key === 'Escape') {
				if (pending) return;
				event.preventDefault();
				close();
				return;
			}
			if (event.key !== 'Tab') return;

			// 대화상자 안에서만 Tab이 순환한다.
			const items = focusables(panel);
			if (items.length === 0) {
				event.preventDefault();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener('keydown', onkeydown, true);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('keydown', onkeydown, true);
		};
	});

	function close() {
		if (pending) return;
		open = false;
		onclosed?.();
		requestAnimationFrame(() => {
			if (lastActive?.isConnected) lastActive.focus();
			else document.getElementById('main-content')?.focus();
		});
	}
</script>

<!-- Popup 패널 자체는 전체 화면을 채우므로 배경을 투명하게 두고 우리 카드만 그린다. -->
<Popup visible={open} position="center" size={0} transparent maskClosable={!pending} onclose={close}>
	<div class="flex w-full justify-center px-4">
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			tabindex="-1"
			class="flex max-h-[85dvh] w-full max-w-[34rem] flex-col overflow-hidden rounded-[var(--radius-box)] border border-line bg-surface-overlay shadow-[var(--shadow-overlay)] outline-none"
		>
		<div class="border-b border-line px-5 pt-5 pb-3">
			<h2 id={titleId} class="text-title-l">{title}</h2>
			{#if description}<p class="mt-1 text-body-s text-muted">{description}</p>{/if}
		</div>

		<div class="overflow-y-auto px-5 py-4">{@render children()}</div>

		<div class="space-y-3 border-t border-line px-5 py-4">
			{#if submitError}
				<p role="alert" class="text-body-s" style:color="var(--danger)">{submitError}</p>
			{/if}
			<div class="flex justify-end gap-2">
				{#if footer}{@render footer()}{/if}
				<Button size="auto" injClass="px-4" fill="line" disabled={pending} onclick={close}>
					{cancelLabel}
				</Button>
				<Button
					size="auto"
					injClass="px-4"
					fill="base"
					state={submitTone}
					disabled={!canSubmit}
					loading={pending ? { height: '4', width: '4' } : null}
					onclick={onsubmit}
				>
					{submitLabel}
				</Button>
			</div>
		</div>
	</div>
	</div>
</Popup>
