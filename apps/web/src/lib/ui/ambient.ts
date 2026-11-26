import type { Attachment } from 'svelte/attachments';

/**
 * 직계 `.ambient-clip > .ambient-glow`의 시안광을 마우스 방향으로 넓게 옮긴다.
 * 터치·펜 입력에는 반응하지 않으며, 동작 줄이기에서는 CSS가 변형을 적용하지 않는다.
 */
export const ambientGlow: Attachment<HTMLElement> = (node) => {
    const glow = node.querySelector<HTMLElement>(':scope > .ambient-clip > .ambient-glow');
    if (!glow) return;

    function move(event: PointerEvent) {
        if (event.pointerType !== 'mouse') return;
        const bounds = node.getBoundingClientRect();
        const left = 1 - (event.clientX - bounds.left) / bounds.width;
        const down = event.clientY / innerHeight;
        const sweep = `translate(${-42 * left}cqw, ${18 * down}svh)`;
        const beam = `rotate(${8 - down * 54}deg) scale(${1 + left * 0.7}, ${1 - left * 0.25})`;
        glow!.style.setProperty('--glow-shape', `${sweep} ${beam}`);
    }
    function leave() {
        glow!.style.removeProperty('--glow-shape');
    }

    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', leave);
    return () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerleave', leave);
    };
};
