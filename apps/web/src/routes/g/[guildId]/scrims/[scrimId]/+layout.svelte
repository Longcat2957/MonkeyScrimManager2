<script lang="ts">
	import { page } from '$app/state';
	import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// 경매는 작업판이 화면 대부분을 써야 하므로 머리를 한 줄로 줄인다.
	const compact = $derived(page.route.id?.endsWith('/teams/auction') ?? false);
</script>

<!-- 내전 제목·상태·일정은 하위 세 페이지 위에 한 번만 표시한다. 하위 페이지 제목은 h2부터 시작한다. -->
{#if data.scrim}
	<ScrimSummary scrim={data.scrim} artUrl={data.artUrl} {compact} />
{/if}
{@render children()}
