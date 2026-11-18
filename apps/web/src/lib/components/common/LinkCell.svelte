<script lang="ts">
    import type { Snippet } from 'svelte';

    type Props = {
        href: string | null;
        title?: string;
        subTitle?: string;
        detail?: string;
        info?: string;
        // 마지막 행이 아니면 안쪽으로 들인 구분선을 그린다.
        line?: boolean;
        titleChild?: Snippet;
        leftChild?: Snippet;
        detailChild?: Snippet;
        infoChild?: Snippet;
    };

    let {
        href,
        title = '',
        subTitle = '',
        detail = '',
        info = '',
        line = false,
        titleChild,
        leftChild,
        detailChild,
        infoChild
    }: Props = $props();

    // 왼쪽 요소 유무에 따라 본문·오른쪽 열의 위치가 바뀐다.
    const col = $derived(
        leftChild
            ? { main: 'col-start-2', right: 'col-start-3' }
            : { main: 'col-start-1', right: 'col-start-2' }
    );
</script>

<!--
    이동하는 행만 링크로 렌더링한다.
    오른쪽 detail은 항상 제목 줄, info는 항상 부제 줄에 맞추도록 grid로 배치한다.
    오른쪽 칸은 flex로 두어 작은 글자가 부모 줄 높이를 물려받아 행이 커지지 않게 한다.
    행 목록이 overflow-hidden일 수 있으므로 포커스 표시는 행 안쪽에 그린다.
    relative는 행 안의 sr-only(absolute) 텍스트가 스크롤 영역 밖으로 빠져 문서 높이를 늘리지 않게 한다.
-->
<svelte:element
    this={href ? 'a' : 'div'}
    href={href ?? undefined}
    class={[
        'relative block bg-surface px-3.5',
        href && 'no-underline hover:bg-surface-hover focus-visible:-outline-offset-2 active:bg-selected'
    ]}
>
    <span
        class={[
            'grid min-h-11 w-full items-center gap-x-2.5 gap-y-0.5 py-2',
            leftChild ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
            line && 'border-b border-line'
        ]}
    >
        {#if leftChild}
            <span class="col-start-1 row-span-2 row-start-1 self-center">{@render leftChild()}</span>
        {/if}
        <span class={['row-start-1 truncate text-ui font-semibold text-ink', col.main]}>
            {#if titleChild}{@render titleChild()}{:else}{title}{/if}
        </span>
        {#if detailChild || detail}
            <span class={['row-start-1 flex items-center justify-end', col.right]}>
                {#if detailChild}
                    {@render detailChild()}
                {:else}
                    <span class="text-ui text-ink-2">{detail}</span>
                {/if}
            </span>
        {/if}
        {#if subTitle}
            <span class={['row-start-2 truncate text-xs text-muted', col.main]}>{subTitle}</span>
        {/if}
        {#if infoChild || info}
            <span class={['row-start-2 flex items-center justify-end', col.right]}>
                {#if infoChild}
                    {@render infoChild()}
                {:else}
                    <span class="text-xs text-muted">{info}</span>
                {/if}
            </span>
        {/if}
    </span>
</svelte:element>
