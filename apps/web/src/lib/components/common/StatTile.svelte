<script lang="ts">
    let { label, value, note = null }: { label: string; value: string; note?: string | null } = $props();
</script>

<div class="flex h-full min-w-0 flex-col gap-1 bg-surface px-3 py-2.5">
    <p class="text-xs font-semibold text-muted">{label}</p>
    <p class="text-xl leading-tight font-bold text-ink tabular-nums">{value}</p>
    {#if note}<p class="text-xs text-muted tabular-nums">{note}</p>{/if}
</div>
