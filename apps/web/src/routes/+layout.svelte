<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { ConfigProvider } from 'stdf';
	import { ko_KR } from 'stdf/lang';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import AppFooter from '#lib/components/shell/AppFooter.svelte';
	import AppHeader from '#lib/components/shell/AppHeader.svelte';
	import RouteFocus from '#lib/components/shell/RouteFocus.svelte';
	import SkipLink from '#lib/components/shell/SkipLink.svelte';
	import { appearance } from '#lib/shell/appearance.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// 첫 페인트는 app.html의 인라인 스크립트가 처리하고, 하이드레이션 뒤 상태를 맞춘다.
	onMount(() => appearance.sync());

	// 하위 레이아웃이 검증한 문맥만 헤더에 전달한다.
	const guild = $derived(page.data.guild ?? null);
	const scrim = $derived(page.data.scrim ?? null);
	const viewer = $derived(page.data.viewer ?? null);
</script>

<svelte:head>
	<meta name="application-name" content={SERVICE_NAME} />
</svelte:head>

<!-- STDF 기본 문구(페이지 이동 이름, 입력 지우기 등)를 한국어로 고정한다. -->
<ConfigProvider locale={ko_KR}>
	<SkipLink />
	<RouteFocus />
	<div class="flex min-h-dvh flex-col">
		<AppHeader {guild} {scrim} {viewer} />
		<main id="main-content" tabindex="-1" class="shell flex-1 pt-6 pb-16 focus:outline-none sm:pt-8">
			{@render children()}
		</main>
		<AppFooter />
	</div>
</ConfigProvider>
