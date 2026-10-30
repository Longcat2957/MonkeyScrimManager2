import type { Attachment } from 'svelte/attachments';

type OverlayOptions = {
	open: boolean;
	label: string;
	onclose: () => void;
};

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * STDF 오버레이(Popup·ActionPopover·Feedback)를 감싼 요소에 대화상자 동작을 보완한다.
 * STDF 3.0.0은 dialog 역할·포커스 이동·Escape·배경 차단·스크롤 잠금을 제공하지 않는다.
 * 열려 있는 동안 바깥 요소를 inert로 만들고, 닫히면 열기 전 포커스로 돌아간다.
 */
export function overlay({ open, label, onclose }: OverlayOptions): Attachment<HTMLElement> {
	return (node) => {
		if (!open) return;

		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const previousOverflow = document.body.style.overflow;
		const inerted: HTMLElement[] = [];

		node.setAttribute('role', 'dialog');
		node.setAttribute('aria-modal', 'true');
		node.setAttribute('aria-label', label);

		// 오버레이에서 body까지 올라가며 형제 요소를 inert로 만들어 배경 조작과 Tab 이탈을 막는다.
		for (let current: HTMLElement = node; current.parentElement; current = current.parentElement) {
			for (const sibling of current.parentElement.children) {
				if (sibling === current || !(sibling instanceof HTMLElement) || sibling.inert) continue;
				sibling.inert = true;
				inerted.push(sibling);
			}
			if (current.parentElement === document.body) break;
		}
		document.body.style.overflow = 'hidden';

		// STDF 패널은 위치 계산 뒤 몇 프레임 늦게 렌더링되므로 포커스 대상이 생길 때까지 잠시 재시도한다.
		let frame = 0;
		let attempts = 0;
		const focusFirst = () => {
			// STDF Mask는 이름 없는 전체 화면 button이므로 키보드 탐색과 보조기기에서 제외한다.
			for (const mask of node.querySelectorAll<HTMLElement>(':scope > button')) {
				mask.tabIndex = -1;
				mask.setAttribute('aria-hidden', 'true');
			}
			const target =
				node.querySelector<HTMLElement>('[data-autofocus]') ??
				[...node.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => el.tabIndex >= 0);
			target?.focus();
			// 숨김 상태의 패널에서는 focus()가 무시되므로 실제로 포커스가 들어왔는지 확인한다.
			if (!node.contains(document.activeElement) && ++attempts < 30) {
				frame = requestAnimationFrame(focusFirst);
			}
		};
		frame = requestAnimationFrame(focusFirst);

		function onkeydown(event: KeyboardEvent) {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			onclose();
		}
		// 포커스가 아직 오버레이 안으로 옮겨지지 않았어도 닫히도록 document에서 받는다.
		document.addEventListener('keydown', onkeydown, true);

		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('keydown', onkeydown, true);
			node.removeAttribute('role');
			node.removeAttribute('aria-modal');
			node.removeAttribute('aria-label');
			for (const el of inerted) el.inert = false;
			document.body.style.overflow = previousOverflow;
			if (previousFocus?.isConnected) previousFocus.focus();
		};
	};
}
