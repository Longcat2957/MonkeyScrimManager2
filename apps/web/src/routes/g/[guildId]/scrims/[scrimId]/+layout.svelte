<script lang="ts">
	import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<!-- 내전 제목·상태·일정은 하위 세 페이지 위에 한 번만 표시한다. 하위 페이지 제목은 h2부터 시작한다. -->
{#if data.scrim}
	<ScrimSummary scrim={data.scrim} artUrl={data.artUrl} />
{/if}
{@render children()}
