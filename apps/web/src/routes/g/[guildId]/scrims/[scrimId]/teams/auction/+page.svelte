<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim?.title ?? '경매'} · 경매 | {SERVICE_NAME}</title>
</svelte:head>

<h2 class="text-xl font-semibold">경매</h2>
