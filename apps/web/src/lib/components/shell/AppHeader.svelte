<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import { destinationsFor } from '#lib/shell/navigation.ts';
	import type { GuildContext, ScrimContext, ViewerContext } from '#lib/shell/context.ts';
	import AppearanceToggle from './AppearanceToggle.svelte';
	import ContextRail from './ContextRail.svelte';
	import GuildSwitcher from './GuildSwitcher.svelte';

	let {
		guild = null,
		scrim = null,
		viewer = null
	}: {
		guild?: GuildContext | null;
		scrim?: ScrimContext | null;
		viewer?: ViewerContext | null;
	} = $props();

	const rail = $derived(destinationsFor(guild, scrim));
</script>

<!--
	헤더는 하나의 DOM이다. 전역·서버·내전 문맥은 이 안의 내용만 바뀐다.
	헤더는 브랜드·서버 선택·화면 모드만 담당하고, 내전 제목·상태는 본문이 표시한다.
-->
<header
	class="sticky top-0 z-40 border-b border-line backdrop-blur-md"
	style:background-color="color-mix(in oklab, var(--bg) 92%, transparent)"
>
	<div class="shell flex h-[var(--app-header-height)] items-center gap-3">
		<a href={resolve('/')} class="flex items-center gap-2.5" aria-label={`${SERVICE_NAME} 홈`}>
			<img src={asset('brand/logo.png')} alt="" width="30" height="30" class="size-[30px]" />
			<span class="font-brand text-[26px] leading-none font-normal tracking-tight [font-synthesis:none]">
				{SERVICE_NAME}
			</span>
		</a>

		<div class="ml-auto flex items-center gap-1">
			{#if viewer}<GuildSwitcher {guild} {viewer} />{/if}
			<AppearanceToggle />
		</div>
	</div>

	{#if rail.label && rail.items.length > 0}
		<ContextRail items={rail.items} label={rail.label} current={page.url.pathname} />
	{/if}
</header>
