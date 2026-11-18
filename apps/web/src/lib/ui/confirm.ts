import { readonly, writable } from 'svelte/store';

type Confirmation = {
    content: string;
    title: string;
};

const request = writable<Confirmation | null>(null);
export const confirmation = readonly(request);
let resolvePending: ((confirmed: boolean) => void) | null = null;

/** 공통 호스트의 확인·취소·Escape를 한 번만 처리한다. */
export function settleConfirmation(confirmed: boolean) {
    const resolve = resolvePending;
    resolvePending = null;
    request.set(null);
    resolve?.(confirmed);
}

/** 공통 확인창을 열고 사용자가 고른 결과를 반환한다. */
export function confirm(content: string, title = '확인'): Promise<boolean> {
    // 이미 열린 확인창의 요청을 덮어쓰거나 서버 렌더링 중 공유 상태를 만들지 않는다.
    if (typeof document === 'undefined' || resolvePending) return Promise.resolve(false);
    return new Promise((resolve) => {
        resolvePending = resolve;
        request.set({ content, title: title || '확인' });
    });
}
