<script lang="ts">
    import { scheduleParts } from '#lib/features/labels.ts';

    // 날짜가 없으면 emptyText를 점선 상자로 표시한다. 예: 일정 미정, 경기 시각 미확인
    let { iso, emptyText }: { iso: string | null; emptyText: string } = $props();

    const parts = $derived(iso ? scheduleParts(iso) : null);
</script>

{#if parts}
    <span
        class="flex size-10 shrink-0 flex-col items-center justify-center rounded-(--radius-form) border border-line bg-surface-2 leading-none"
    >
        <span class="text-micro leading-none text-muted">{parts.month}월</span>
        <span class="mt-1 text-base leading-none font-bold tabular-nums"
            >{parts.day}<span class="sr-only">일</span></span
        >
    </span>
{:else}
    <span
        class="flex size-10 shrink-0 items-center justify-center rounded-(--radius-form) border border-dashed border-line px-0.5 text-center text-micro leading-tight text-muted"
    >
        {emptyText}
    </span>
{/if}
