<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim?.title ?? '내전 요약'} · 내전 요약 | {SERVICE_NAME}</title>
</svelte:head>

<h2 class="text-xl font-semibold">요약</h2>
