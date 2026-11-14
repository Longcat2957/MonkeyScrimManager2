import type { Attachment } from 'svelte/attachments';

/** STDF의 내부 지우기 버튼이 입력 이름에 섞이지 않게 하고 같은 버튼의 조작 영역을 확보한다. */
export function inputLabel(label: string, clearLabel = `${label} 지우기`): Attachment<HTMLElement> {
    return (node) => {
        const originalLabels = new Map<Element, string | null>();
        const originalClasses = new Map<Element, string>();
        const setLabel = (element: Element, name: string) => {
            if (!originalLabels.has(element)) originalLabels.set(element, element.getAttribute('aria-label'));
            element.setAttribute('aria-label', name);
        };
        const apply = () => {
            const input = node.querySelector('input:not([type="hidden"]), textarea');
            if (input) setLabel(input, label);
            const clear = node.querySelector<HTMLButtonElement>('button[aria-label="clear"]');
            if (clear) {
                setLabel(clear, clearLabel);
                originalClasses.set(clear, clear.className);
                clear.classList.add(
                    '-my-3',
                    'min-h-11',
                    'min-w-11',
                    'flex',
                    'items-center',
                    'justify-center'
                );
            }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            for (const [element, original] of originalLabels) {
                if (original === null) element.removeAttribute('aria-label');
                else element.setAttribute('aria-label', original);
            }
            for (const [element, original] of originalClasses) element.setAttribute('class', original);
        };
    };
}

/** STDF Stepper의 증감 버튼에 각 필드의 목적을 연결한다. */
export function stepperLabels(label: string): Attachment<HTMLElement> {
    return (node) => {
        const originals = new Map<HTMLButtonElement, string>();
        const apply = () => {
            for (const button of node.querySelectorAll<HTMLButtonElement>(
                'button[aria-label="decrease"], button[aria-label="increase"]'
            )) {
                const direction = button.getAttribute('aria-label')!;
                originals.set(button, direction);
                button.setAttribute(
                    'aria-label',
                    `${label} ${direction === 'decrease' ? '줄이기' : '늘리기'}`
                );
            }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            for (const [button, original] of originals) button.setAttribute('aria-label', original);
        };
    };
}

/**
 * STDF Checkbox·Radio·Stepper 등의 항목은 type 없는 button이라 form 안에서 누르면 폼이 제출된다.
 * Enter의 암묵적 제출도 첫 번째 submit 버튼(이런 항목)을 눌러 값을 바꾼다.
 * form에 붙여 type이 없는 button을 type="button"으로 바꾸고, 나중에 렌더링되는 항목도 따라간다.
 * 제출 버튼은 STDF Button에 type="submit"을 명시한다.
 */
export const nonSubmitButtons: Attachment<HTMLFormElement> = (form) => {
    const fix = () => {
        for (const button of form.querySelectorAll('button:not([type])'))
            button.setAttribute('type', 'button');
    };
    fix();
    const observer = new MutationObserver(fix);
    observer.observe(form, { childList: true, subtree: true });
    // 한글 조합을 확정하는 Enter는 폼의 암묵적 제출로 이어지지 않게 한다.
    const composingEnter = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && event.isComposing) event.preventDefault();
    };
    form.addEventListener('keydown', composingEnter, true);
    return () => {
        observer.disconnect();
        form.removeEventListener('keydown', composingEnter, true);
    };
};

/** STDF가 감싸는 실제 입력에 오류와 설명을 연결하며 기존 설명 연결은 보존한다. */
export function inputFeedback(message: string | undefined, feedbackId: string): Attachment<HTMLElement> {
    return (node) => {
        const originals = new Map<Element, string | null>();
        const apply = () => {
            for (const input of node.querySelectorAll('input:not([type="hidden"]), textarea, select')) {
                if (!originals.has(input)) originals.set(input, input.getAttribute('aria-invalid'));
                const descriptions = (input.getAttribute('aria-describedby') ?? '')
                    .split(/\s+/)
                    .filter((id) => id && id !== feedbackId);
                if (message) {
                    input.setAttribute('aria-invalid', 'true');
                    descriptions.push(feedbackId);
                } else {
                    const original = originals.get(input);
                    if (original === null) input.removeAttribute('aria-invalid');
                    else if (original !== undefined) input.setAttribute('aria-invalid', original);
                }
                if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
                else input.removeAttribute('aria-describedby');
            }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            for (const [input, original] of originals) {
                if (original === null) input.removeAttribute('aria-invalid');
                else input.setAttribute('aria-invalid', original);
                const descriptions = (input.getAttribute('aria-describedby') ?? '')
                    .split(/\s+/)
                    .filter((id) => id && id !== feedbackId);
                if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
                else input.removeAttribute('aria-describedby');
            }
        };
    };
}
