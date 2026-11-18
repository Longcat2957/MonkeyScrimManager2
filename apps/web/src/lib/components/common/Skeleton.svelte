<script lang="ts">
    let { rows = 4 }: { rows?: number } = $props();
</script>

<div class="flex flex-col gap-2 py-2" aria-hidden="true">
    {#each Array(rows) as _, index (index)}
        <div
            class="h-9 rounded-small bg-surface-2 motion-safe:animate-pulse"
            style:width={`${92 - (index % 3) * 12}%`}
        ></div>
    {/each}
</div>
