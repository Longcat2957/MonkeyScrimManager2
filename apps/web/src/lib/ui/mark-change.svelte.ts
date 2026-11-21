import type { Attachment } from 'svelte/attachments';

export function flashChange(node: HTMLElement) {
    node.classList.add('workflow-change');
    const cue = node
        .getAnimations()
        .find(
            (animation) => animation instanceof CSSAnimation && animation.animationName === 'workflow-change'
        );
    if (!cue) {
        node.classList.remove('workflow-change');
        return;
    }
    cue.currentTime = 0;
    cue.onfinish = () => node.classList.remove('workflow-change');
}

/** 최초 표시나 같은 자료의 재조회가 아니라 이미 보이는 값이 바뀔 때만 강조한다. */
export function markChange(value: () => string): Attachment<HTMLElement> {
    return (node) => {
        let previous: string | undefined;
        $effect(() => {
            const current = value();
            if (previous !== undefined && current !== previous) flashChange(node);
            previous = current;
        });
    };
}
