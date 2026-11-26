<script lang="ts">
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import type { RecordSample } from '#lib/content/landing.ts';

    // 서버 순위표를 닮은 장식용 예시. 실제 순위가 아니므로 보조 기술에서 제외한다.
    let { rows }: { rows: RecordSample } = $props();
    const MEDAL = ['text-medal-gold', 'text-medal-silver', 'text-medal-bronze'];
</script>

<div aria-hidden="true" inert class="panel overflow-hidden">
    <div class="panel-bar">
        <strong class="text-sm">시즌 순위</strong>
        <span class="text-micro text-muted">MMR</span>
    </div>
    <ol class="divide-y divide-line">
        {#each rows as row, index (row.name)}
            <li class="flex items-center gap-3 px-4 py-2.5">
                <span class={['w-5 font-brand text-base font-bold', MEDAL[index]]}>{index + 1}</span>
                <PositionIcon position={row.position} size="sm" />
                <span class="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
                <span class="hidden text-micro text-muted sm:inline">{row.record}</span>
                <span class="font-brand text-base font-bold tabular-nums">{row.mmr}</span>
            </li>
        {/each}
    </ol>
</div>
