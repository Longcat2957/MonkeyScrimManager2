export const MAX_OPTIONS = 12;

// 마지막 불완전한 구간을 버려 모든 선택지의 확률을 같게 한다.
export function drawIndex(count: number) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_OPTIONS) throw new RangeError('선택지 수 오류');
    const byte = new Uint8Array(1);
    const limit = 256 - (256 % count);
    do crypto.getRandomValues(byte);
    while (byte[0] >= limit);
    return byte[0] % count;
}

// 첫 칸은 12시에서 시작하며 당첨 칸의 중앙이 고정 지침을 향한다.
export function pointerRotation(index: number, count: number) {
    return 360 - ((index + 0.5) * 360) / count;
}

export function animateDraw(element: Element, keyframes: Keyframe[], duration: number, reveal: () => void) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        reveal();
        return;
    }
    const animation = element.animate(keyframes, { duration });
    animation.onfinish = reveal;
    return animation;
}
