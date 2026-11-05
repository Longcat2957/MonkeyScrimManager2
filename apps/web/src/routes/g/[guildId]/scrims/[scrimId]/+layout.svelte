<script lang="ts">
    import { page } from '$app/state';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();

    // 경매·대진은 작업판을 바로 볼 수 있도록 내전 머리를 한 줄로 줄인다.
    const compact = $derived(
        Boolean(
            page.route.id?.endsWith('/auction') ||
            page.route.id?.endsWith('/bracket') ||
            page.route.id?.endsWith('/result')
        )
    );
</script>

<!-- 내전 제목·상태·일정은 하위 세 페이지 위에 한 번만 표시한다. 하위 페이지 제목은 h2부터 시작한다. -->
{#if data.scrim}
    <ScrimSummary scrim={data.scrim} artUrl={data.artUrl} {compact} />
{/if}
{@render children()}
