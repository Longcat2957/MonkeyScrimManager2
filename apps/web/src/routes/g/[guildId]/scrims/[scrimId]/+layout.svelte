<script lang="ts">
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<!-- 내전 머리·단계 도관은 각 페이지가 자기 데이터로 한 번만 그린다. -->
{@render children()}
