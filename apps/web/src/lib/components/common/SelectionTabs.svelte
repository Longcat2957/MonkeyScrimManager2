<script lang="ts">
    import { Tab } from 'stdf';
    import type { TabProps } from 'stdf';
    import type { Attachment } from 'svelte/attachments';

    let { labels = [], active = $bindable(0), tabInjClass = '', ...options }: TabProps = $props();

    // STDF의 모양과 버튼 동작은 유지하고, 필터·보기 선택 상태를 보조기기에 알린다.
    const accessible: Attachment<HTMLDivElement> = (node) => {
        const selected = active;
        const count = labels.length;
        const apply = () => {
            for (const [index, button] of node.querySelectorAll('button').entries()) {
                button.type = 'button';
                button.setAttribute('aria-pressed', String(index < count && index === selected));
            }
        };
        apply();
        // 레이블 수나 STDF의 렌더링 분기가 바뀌어 버튼이 교체되어도 상태를 적용한다.
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true });
        return () => observer.disconnect();
    };
</script>

<div class="min-w-0" data-selection-tabs {@attach accessible}>
    <Tab {...options} {labels} bind:active tabInjClass={`min-h-11 ${tabInjClass}`} />
</div>
