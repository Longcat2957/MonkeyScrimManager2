<script lang="ts">
    import { Pagination } from 'stdf';
    import type { Attachment } from 'svelte/attachments';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type Props = {
        total: number;
        pageSize: number;
        current: number;
        onchange: (page: number) => void;
        label?: string;
    };

    // 목록 아래 쪽 번호. 한 쪽뿐이면 그리지 않는다.
    let { total, pageSize, current, onchange, label = '쪽 이동' }: Props = $props();

    // 공식 표시 개수는 유지하고, 44px 조작 영역이 한 줄에 안 들어가면 DOM 순서대로 줄을 바꾼다.
    const maxShowPage = $derived(desktop.current ? 7 : 5);
    const slots = $derived(Math.min(Math.ceil(total / pageSize), maxShowPage) + 2);
    const id = $props.id();
    let showNextOmitPage = $state(false);
    let showPreOmitPage = $state(false);
    let root: HTMLDivElement | null = $state(null);

    // 이전·다음 버튼의 영어 aria-label을 바꾸고 현재 쪽에 aria-current를 준다. 쪽이 바뀌면 다시 그려지므로 변경을 지켜본다.
    const accessible: Attachment<HTMLElement> = (node) => {
        const NAMES: Record<string, string> = { pre: '이전 쪽', next: '다음 쪽' };
        const apply = () => {
            const pagination = node.firstElementChild;
            for (const button of node.querySelectorAll('button')) {
                button.type = 'button';
                const name = NAMES[button.getAttribute('aria-label') ?? ''];
                if (name) button.setAttribute('aria-label', name);
                const page = button.textContent?.trim();
                if (page && /^\d+$/.test(page)) {
                    if (Number(page) === current) button.setAttribute('aria-current', 'page');
                    else button.removeAttribute('aria-current');
                } else if (button.parentElement === pagination && !button.getAttribute('aria-label')) {
                    const direction =
                        button.previousElementSibling?.textContent?.trim() === '1' ? 'pre' : 'next';
                    button.dataset.pageNavEllipsis = direction;
                    button.setAttribute(
                        'aria-label',
                        `${direction === 'pre' ? '이전' : '다음'} 쪽 번호 더 보기`
                    );
                }
                const direction = button.dataset.pageNavEllipsis;
                if (direction) {
                    const open = direction === 'pre' ? showPreOmitPage : showNextOmitPage;
                    button.setAttribute('aria-expanded', String(open));
                    if (open) button.setAttribute('aria-controls', `${id}-${direction}`);
                    else button.removeAttribute('aria-controls');
                }
            }
            const panels =
                pagination?.querySelectorAll<HTMLElement>(':scope > .pagination-second-page-popover') ?? [];
            let index = 0;
            for (const [direction, open] of [
                ['next', showNextOmitPage],
                ['pre', showPreOmitPage]
            ] as const) {
                if (!open) continue;
                const panel = panels[index++];
                if (panel) {
                    panel.id = `${id}-${direction}`;
                    panel.dataset.pageNavPanel = '';
                    panel.setAttribute('role', 'group');
                    panel.setAttribute('aria-label', `${direction === 'pre' ? '이전' : '다음'} 쪽 번호 목록`);
                    const trigger = pagination?.querySelector<HTMLButtonElement>(
                        `button[data-page-nav-ellipsis="${direction}"]`
                    );
                    if (trigger && pagination) {
                        // STDF의 한 줄 기준 비율 대신 실제 버튼에 맞춰 줄바꿈 뒤에도 목록을 연결한다.
                        const bounds = pagination.getBoundingClientRect();
                        const target = trigger.getBoundingClientRect();
                        const half = panel.getBoundingClientRect().width / 2;
                        const targetCenter = target.left + target.width / 2 - bounds.left;
                        const center = Math.max(half + 4, Math.min(bounds.width - half - 4, targetCenter));
                        panel.style.left = `${center}px`;
                        panel.style.right = 'auto';
                        panel.style.top = `${target.top - bounds.top - 12}px`;
                        // STDF의 개별 translate와 중복 이동하지 않게 한다.
                        panel.style.translate = 'none';
                        panel.style.transform = 'translate(-50%, -100%)';
                        const arrow = panel.lastElementChild;
                        if (arrow instanceof HTMLElement)
                            arrow.style.left = `${targetCenter - center + half}px`;
                    }
                }
            }
        };
        // 두 생략 목록이 겹치지 않게 하며 원래 STDF 클릭 동작은 그대로 실행한다.
        const selectList = (event: MouseEvent) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (button?.dataset.pageNavEllipsis === 'pre') showNextOmitPage = false;
            else if (button?.dataset.pageNavEllipsis === 'next') showPreOmitPage = false;
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true, characterData: true });
        const resizeObserver = new ResizeObserver(apply);
        if (node.firstElementChild) resizeObserver.observe(node.firstElementChild);
        node.addEventListener('click', selectList);
        return () => {
            observer.disconnect();
            resizeObserver.disconnect();
            node.removeEventListener('click', selectList);
        };
    };

    function dismissLists(event: KeyboardEvent) {
        if (
            event.key !== 'Escape' ||
            !(showNextOmitPage || showPreOmitPage) ||
            !root?.contains(document.activeElement)
        )
            return;
        const panel = document.activeElement?.closest('[data-page-nav-panel]');
        const trigger = panel?.id
            ? root.querySelector<HTMLButtonElement>(`button[aria-controls="${panel.id}"]`)
            : root.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');
        showNextOmitPage = false;
        showPreOmitPage = false;
        trigger?.focus();
        event.preventDefault();
        event.stopPropagation();
    }
</script>

<svelte:window onkeydown={dismissLists} />

{#if total > pageSize}
    <nav aria-label={label} class="page-nav flex min-w-0 justify-center pt-2">
        <div bind:this={root} class="min-w-0 w-full" style:max-width="{slots * 3.25}rem" {@attach accessible}>
            <Pagination
                {total}
                {pageSize}
                {current}
                {maxShowPage}
                bind:showNextOmitPage
                bind:showPreOmitPage
                type="block"
                bg="surface"
                injClass="page-nav-controls gap-1 border border-border p-1 [&_button]:min-h-11 [&_button]:min-w-11"
                {onchange}
            />
        </div>
    </nav>
{/if}

<style>
    .page-nav :global(.page-nav-controls) {
        flex-wrap: wrap;
        flex-wrap: balance;
    }

    /* 네이티브 생략 목록은 위로 열리므로 스크롤 래퍼로 자르지 않는다. */
    .page-nav :global(.pagination-second-page-popover) {
        min-inline-size: 9rem;
    }
</style>
