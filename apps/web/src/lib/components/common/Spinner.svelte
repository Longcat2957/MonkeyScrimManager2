<script lang="ts">
    let { label = '불러오는 중' }: { label?: string } = $props();
</script>

<span role="status" class="inline-flex items-center gap-2 text-ui text-muted">
    <span
        class="size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        aria-hidden="true"
    ></span>
    <span class="sr-only">{label}</span>
</span>
