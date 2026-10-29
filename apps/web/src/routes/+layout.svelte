<script lang="ts">
	import './layout.css';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import AppHeader from '#lib/components/layout/AppHeader.svelte';
	import AppFooter from '#lib/components/layout/AppFooter.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>{SERVICE_NAME}</title>
	<meta name="application-name" content={SERVICE_NAME} />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<a
		href="#main-content"
		class="fixed top-2 left-4 z-[60] -translate-y-24 border border-border bg-bg-surface px-4 py-2 focus:translate-y-0 dark:bg-bg-surface-dark"
	>
		본문으로 건너뛰기
	</a>
	<AppHeader />
	<main id="main-content" tabindex="-1" class="app-frame flex-1 px-5 py-8 md:px-10 md:py-12">
		{@render children()}
	</main>
	<AppFooter />
</div>
