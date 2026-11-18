import type { Attachment } from 'svelte/attachments';

export const preventComposingSubmit: Attachment<HTMLFormElement> = (form) => {
    // 한글 조합을 확정하는 Enter는 폼의 암묵적 제출로 이어지지 않게 한다.
    const composingEnter = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && event.isComposing) event.preventDefault();
    };
    form.addEventListener('keydown', composingEnter, true);
    return () => {
        form.removeEventListener('keydown', composingEnter, true);
    };
};
