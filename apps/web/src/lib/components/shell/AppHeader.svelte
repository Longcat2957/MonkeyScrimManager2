<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import { destinationsFor } from '#lib/shell/navigation.ts';
	import type { GuildContext, ScrimContext, ViewerContext } from '#lib/shell/context.ts';
	import AppearanceToggle from './AppearanceToggle.svelte';
	import ContextRail from './ContextRail.svelte';

	let {
		guild = null,
		scrim = null,
		viewer = null
	}: {
		guild?: GuildContext | null;
		scrim?: ScrimContext | null;
		viewer?: ViewerContext | null;
	} = $props();

	// 현재 경로의 문맥에 맞는 레일 하나만 고른다. 내전 > 서버 > 전역 순이다.
	const rail = $derived(destinationsFor(guild, scrim));
</script>

<!--
	헤더는 하나의 DOM이다. 전역·서버·내전 문맥은 이 안의 내용만 바뀐다.
	서버 선택기(P3)·계정 메뉴(인증 후)가 같은 줄에 들어오므로 폭은 셸 기준선을 공유한다.
-->
<header class="sticky top-0 z-40 border-b border-line bg-surface-app/95 backdrop-blur-sm">
	<div class="shell flex h-[var(--app-header-height)] items-center gap-3">
		<a
			href={resolve('/')}
			class="flex min-w-0 shrink-0 items-center gap-2 rounded-sm py-1"
			aria-label={`${SERVICE_NAME} 홈`}
		>
			<img src={asset('brand/logo.png')} alt="" width="28" height="28" class="size-7" />
			<span class="font-brand text-2xl leading-none font-normal tracking-tight [font-synthesis:none]">
				{SERVICE_NAME}
			</span>
		</a>

		{#if scrim && guild}
			<span class="text-faint" aria-hidden="true">/</span>
			<span class="flex min-w-0 items-center gap-2 text-body-s text-muted">
				<span class="hidden shrink-0 sm:inline">{guild.name}</span>
				<span class="hidden text-faint sm:inline" aria-hidden="true">/</span>
				<span class="truncate font-semibold text-fg">{scrim.title}</span>
			</span>
		{:else if guild}
			<span class="text-faint" aria-hidden="true">/</span>
			<span class="truncate text-body-s font-semibold">{guild.name}</span>
		{:else if viewer && viewer.guilds.length > 0}
			<!-- 서버 선택기는 P3에서 연결한다. 그전에는 현재 서버 목록을 알려 주지 않는다. -->
			<span class="sr-only">서버가 선택되지 않았습니다.</span>
		{/if}

		<div class="ml-auto flex shrink-0 items-center gap-1">
			<AppearanceToggle />
		</div>
	</div>

	{#if rail.label && rail.items.length > 0}
		<ContextRail items={rail.items} label={rail.label} current={page.url.pathname} />
	{/if}
</header>
