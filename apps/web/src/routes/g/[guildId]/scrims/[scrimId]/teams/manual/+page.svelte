<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim?.title ?? '수동 편성'} · 수동 편성 | {SERVICE_NAME}</title>
</svelte:head>

<h2 class="text-xl font-semibold">수동 편성</h2>
