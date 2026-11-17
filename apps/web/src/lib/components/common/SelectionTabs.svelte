<script lang="ts">
    // 필터·보기 전환은 한 가지 탭 어휘로 통일한다.
    let {
        labels = [],
        active = $bindable(0),
        tabInjClass = '',
        onclickTab,
        showNum: _showNum
    }: {
        labels: (string | { text: string })[];
        active?: number;
        tabInjClass?: string;
        onclickTab?: (index: number) => void;
        showNum?: number;
    } = $props();

    // 이전 호출부는 { text } 항목을 넘기고, 새 화면은 문자열을 넘긴다.
    const items = $derived(labels.map((label) => (typeof label === 'string' ? label : label.text)));
</script>

<div class="flex min-w-0 gap-1 overflow-x-auto" role="tablist">
    {#each items as label, index (label)}
        <button
            type="button"
            role="tab"
            aria-selected={active === index}
            class={[
                'min-h-11 whitespace-nowrap rounded-(--radius-small) px-3 text-sm font-semibold',
                active === index
                    ? 'bg-hex/15 text-hex'
                    : 'text-text-muted hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark',
                tabInjClass
            ]}
            onclick={() => {
                active = index;
                onclickTab?.(index);
            }}
        >
            {label}
        </button>
    {/each}
</div>
