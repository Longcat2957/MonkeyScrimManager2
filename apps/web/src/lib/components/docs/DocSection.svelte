<script lang="ts">
    import type { Snippet } from 'svelte';

    // 목차가 가리키는 한 장. 제목은 목차와 같은 표에서 받는다.
    let { id, title, children }: { id: string; title: string; children: Snippet } = $props();
</script>

<section {id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{title}</h2>
    {@render children()}
</section>
