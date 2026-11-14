<script lang="ts">
    import { Accordion } from 'stdf';
    import type { AccordionProps } from 'stdf';
    import type { Attachment } from 'svelte/attachments';
    import { MediaQuery } from 'svelte/reactivity';

    let {
        items,
        activeIndex = $bindable<number | number[] | undefined>(undefined),
        multiple = false,
        transitionDuration = 300,
        ...options
    }: AccordionProps = $props();

    const id = $props.id();
    const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)', false);

    // STDF의 항목 바로 아래 제목 버튼과 패널만 연결하고, 본문의 다른 버튼은 건드리지 않는다.
    const accessible: Attachment<HTMLDivElement> = (node) => {
        const current = activeIndex;
        const several = multiple;
        const count = items.length;
        const apply = () => {
            const root = node.firstElementChild;
            for (let index = 0; index < count; index++) {
                const item = root?.children.item(index);
                const button = item?.querySelector<HTMLButtonElement>(':scope > button');
                if (!button) continue;
                const expanded =
                    several && Array.isArray(current) ? current.includes(index) : current === index;
                button.id = `${id}-trigger-${index}`;
                button.setAttribute('aria-expanded', String(expanded));
                const panel = button.nextElementSibling;
                if (panel instanceof HTMLElement) {
                    panel.id = `${id}-panel-${index}`;
                    panel.inert = !expanded;
                    button.setAttribute('aria-controls', panel.id);
                } else {
                    // STDF는 접힌 패널을 제거하므로 존재하는 패널에만 연결한다.
                    button.removeAttribute('aria-controls');
                }
            }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true });
        return () => observer.disconnect();
    };
</script>

<div class="accessible-accordion min-w-0" data-accessible-accordion {@attach accessible}>
    <Accordion
        {...options}
        {items}
        {multiple}
        bind:activeIndex
        transitionDuration={reducedMotion.current ? 0 : transitionDuration}
    />
</div>

<style>
    @media (prefers-reduced-motion: reduce) {
        /* STDF의 패널 시간 옵션과 별개인 제목 화살표의 회전 전환만 끈다. */
        .accessible-accordion > :global(div > div > button > span) {
            transition-duration: 0s;
        }
    }
</style>
