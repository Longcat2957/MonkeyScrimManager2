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

    // STDF Pagination은 칸마다 flex-1이라 감싸는 폭만큼 나눠 가진다. 칸 수(번호 최대 7, 모바일 5 + 이전·다음)에 맞춰 폭을 주어 칸마다 44px 이상을 확보한다(칸 사이 간격 포함 3.25rem).
    const maxShowPage = $derived(desktop.current ? 7 : 5);
    const slots = $derived(Math.min(Math.ceil(total / pageSize), maxShowPage) + 2);

    // 이전·다음 버튼의 영어 aria-label을 바꾸고 현재 쪽에 aria-current를 준다. 쪽이 바뀌면 다시 그려지므로 변경을 지켜본다.
    const accessible: Attachment<HTMLElement> = (node) => {
        const NAMES: Record<string, string> = { pre: '이전 쪽', next: '다음 쪽' };
        const apply = () => {
            for (const button of node.querySelectorAll('button')) {
                const name = NAMES[button.getAttribute('aria-label') ?? ''];
                if (name) button.setAttribute('aria-label', name);
                const page = button.textContent?.trim();
                if (page && /^\d+$/.test(page)) {
                    if (Number(page) === current) button.setAttribute('aria-current', 'page');
                    else button.removeAttribute('aria-current');
                }
            }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
    };
</script>

{#if total > pageSize}
    <nav aria-label={label} class="flex justify-center pt-2">
        <div class="w-full" style:max-width="{slots * 3.25}rem" {@attach accessible}>
            <Pagination
                {total}
                {pageSize}
                {current}
                {maxShowPage}
                type="block"
                bg="surface"
                injClass="gap-1 border border-border p-1 [&>button]:min-h-10"
                {onchange}
            />
        </div>
    </nav>
{/if}
