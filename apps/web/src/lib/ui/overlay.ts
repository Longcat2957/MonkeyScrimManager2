import type { Attachment } from 'svelte/attachments';

type OverlayOptions = {
    open: boolean;
    label: string;
    onclose: () => void;
};

type ActiveOverlay = {
    node: HTMLElement;
    previousFocus: HTMLElement | null;
};

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const active: ActiveOverlay[] = [];
const inerted = new Map<HTMLElement, boolean>();
let previousOverflow = '';

const top = () => active.at(-1);
const canFocus = (node: HTMLElement) =>
    node.isConnected &&
    !node.closest('[inert]') &&
    !node.matches(':disabled') &&
    node.getClientRects().length > 0 &&
    getComputedStyle(node).visibility !== 'hidden';

function focusable(node: HTMLElement) {
    return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && canFocus(el)
    );
}

function focusFirst(node: HTMLElement) {
    const preferred = node.querySelector<HTMLElement>('[data-autofocus]');
    const target = preferred && canFocus(preferred) ? preferred : focusable(node)[0];
    (target ?? node).focus({ preventScroll: true });
    return Boolean(target && document.activeElement === target);
}

function syncBackground() {
    // 부모 팝업이 차단했던 루트 확인창도 열릴 수 있도록 이전 차단을 먼저 복원한다.
    for (const [node, value] of inerted) node.inert = value;
    inerted.clear();
    const current = top();
    if (!current) {
        document.body.style.overflow = previousOverflow;
        return;
    }
    for (let node = current.node; node.parentElement; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
            if (sibling === node || !(sibling instanceof HTMLElement)) continue;
            inerted.set(sibling, sibling.inert);
            sibling.inert = true;
        }
        if (node.parentElement === document.body) break;
    }
    document.body.style.overflow = 'hidden';
}

/** 메뉴 시트가 열려 있는 동안 배경을 차단하고 닫을 때 포커스를 돌려준다. */
export function overlay({ open, label, onclose }: OverlayOptions): Attachment<HTMLElement> {
    return (node) => {
        if (!open) return;

        const entry: ActiveOverlay = {
            node,
            previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null
        };
        const previousTabIndex = node.getAttribute('tabindex');
        if (!active.length) previousOverflow = document.body.style.overflow;
        active.push(entry);
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-modal', 'true');
        node.setAttribute('aria-label', label);
        node.tabIndex = -1;
        syncBackground();

        // 패널 렌더링을 기다리되 새 오버레이의 포커스를 빼앗지 않는다.
        let frame = 0;
        let attempts = 0;
        const moveFocus = () => {
            if (top() !== entry) return;
            if (!focusFirst(node) && ++attempts < 30) frame = requestAnimationFrame(moveFocus);
        };
        frame = requestAnimationFrame(moveFocus);

        function onkeydown(event: KeyboardEvent) {
            if (top() !== entry) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                onclose();
            } else if (event.key === 'Tab') {
                const targets = focusable(node);
                const first = targets[0];
                const last = targets.at(-1);
                const focused = document.activeElement;
                if (!first) {
                    event.preventDefault();
                    node.focus();
                } else if (
                    !targets.includes(focused as HTMLElement) ||
                    (event.shiftKey ? focused === first : focused === last)
                ) {
                    event.preventDefault();
                    (event.shiftKey ? last : first)?.focus();
                }
            }
        }
        document.addEventListener('keydown', onkeydown, true);

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onkeydown, true);
            const wasTop = top() === entry;
            active.splice(active.indexOf(entry), 1);
            // 메뉴→확인창처럼 앞 팝업이 먼저 사라지면 복귀 목적지를 원래 트리거로 이어 준다.
            for (const remaining of active) {
                if (remaining.previousFocus && node.contains(remaining.previousFocus)) {
                    remaining.previousFocus = entry.previousFocus;
                }
            }
            node.removeAttribute('role');
            node.removeAttribute('aria-modal');
            node.removeAttribute('aria-label');
            if (previousTabIndex === null) node.removeAttribute('tabindex');
            else node.setAttribute('tabindex', previousTabIndex);
            syncBackground();
            if (!wasTop) return;
            const remaining = top();
            if (
                entry.previousFocus &&
                canFocus(entry.previousFocus) &&
                (!remaining || remaining.node.contains(entry.previousFocus))
            ) {
                entry.previousFocus.focus({ preventScroll: true });
            } else if (remaining) {
                focusFirst(remaining.node);
            } else {
                document.getElementById('main-content')?.focus({ preventScroll: true });
            }
        };
    };
}
