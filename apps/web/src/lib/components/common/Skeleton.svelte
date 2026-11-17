<script lang="ts">
    let { rows = 4 }: { rows?: number } = $props();
</script>

<div class="flex flex-col gap-2 py-2" aria-hidden="true">
    {#each Array(rows) as _, index (index)}
        <div
            class="h-10 animate-pulse rounded-(--radius-small) bg-bg-highlight dark:bg-bg-highlight-dark"
            style:width={`${92 - (index % 3) * 12}%`}
        ></div>
    {/each}
</div>
