import { writable } from 'svelte/store';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastItem = {
    id: number;
    tone: ToastTone;
    message: string;
};

// 동시에 쌓이지 않도록 최근 몇 개만 남긴다.
const items = writable<ToastItem[]>([]);
let nextId = 1;

export const toasts = { subscribe: items.subscribe };

function push(tone: ToastTone, message: string) {
    if (typeof window === 'undefined') return;
    const id = nextId++;
    items.update((list) => [...list.slice(-2), { id, tone, message }]);
    setTimeout(() => {
        items.update((list) => list.filter((item) => item.id !== id));
    }, 5000);
}

export const toast = {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message)
};

export function dismissToast(id: number) {
    items.update((list) => list.filter((item) => item.id !== id));
}
