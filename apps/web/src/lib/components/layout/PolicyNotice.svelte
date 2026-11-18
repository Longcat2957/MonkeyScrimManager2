<script lang="ts">
    let { title }: { title: string } = $props();
</script>

<!-- 승인된 본문과 시행일이 없으므로 발행 상태만 표시한다. -->
<article class="mx-auto max-w-4xl pt-6 sm:pt-14">
    <header
        class="grid items-baseline gap-4 border-y border-line-strong py-6 sm:grid-cols-[1fr_auto] sm:py-10"
    >
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p class="inline-flex items-center gap-2 text-sm font-semibold text-muted">
            <span aria-hidden="true" class="size-2 rounded-full border border-line-strong"></span>준비
            중이에요.
        </p>
    </header>
</article>
