<script lang="ts">
    // 필터·보기 전환은 한 가지 탭 어휘로 통일한다.
    let {
        labels,
        active = $bindable(0),
        onchange
    }: {
        labels: string[];
        active?: number;
        onchange?: (index: number) => void;
    } = $props();
</script>

<div
    class="flex w-fit max-w-full min-w-0 gap-0.75 overflow-x-auto rounded-form border border-line bg-surface-2 p-1"
>
    {#each labels as label, index (label)}
        <button
            type="button"
            aria-pressed={active === index}
            class={[
                'min-h-7 whitespace-nowrap rounded-small border px-2.5 text-xs font-semibold focus-visible:-outline-offset-2 pointer-coarse:min-h-11',
                active === index
                    ? 'border-nexus bg-selected text-ink'
                    : 'border-transparent text-muted hover:bg-surface-hover hover:text-ink'
            ]}
            onclick={() => {
                active = index;
                onchange?.(index);
            }}
        >
            {label}
        </button>
    {/each}
</div>
