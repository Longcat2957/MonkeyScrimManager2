<script lang="ts">
    let { label = '불러오는 중' }: { label?: string } = $props();
</script>

<span role="status" class="inline-flex items-center gap-2 text-sm text-text-muted">
    <span
        class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
    ></span>
    <span class="sr-only">{label}</span>
</span>
