<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, CellGroup, NavBar, Popup } from 'stdf';
	import type { ActionProps } from 'stdf';
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { currentMode, setMode, type ThemeMode } from '#lib/ui/theme.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';
	import SwitchCell from '#lib/components/common/SwitchCell.svelte';
	import ContextNav from './ContextNav.svelte';
	import MenuButton from './MenuButton.svelte';
	import { guildNavItems, scrimNavItems, type NavItem } from './navigation.ts';

	let mode: ThemeMode = $state('primary');
	let menuOpen = $state(false);

	onMount(() => {
		mode = currentMode();
	});

	const user = $derived(page.data.user ?? null);
	const guilds = $derived(page.data.guilds ?? []);
	const guild = $derived(page.data.guild ?? null);
	const scrim = $derived(page.data.scrim ?? null);
	const pathname = $derived(page.url.pathname);

	const guildItems = $derived(guild ? guildNavItems(guild, pathname) : []);
	const scrimItems = $derived(guild && scrim ? scrimNavItems(guild.id, scrim, pathname) : []);
	// 내전 범위에서는 내전 메뉴가 주 메뉴이고 서버 메뉴는 보조 메뉴로 내려간다.
	const primaryItems = $derived(scrim ? scrimItems : guildItems);

	const accountItems = $derived<NavItem[]>(
		user
			? [
					{ label: '내 정보', href: resolve('/me'), current: pathname === '/me' },
					...(user.isServiceAdmin
						? [{ label: '백오피스', href: resolve('/backoffice'), current: pathname.startsWith('/backoffice') }]
						: [])
				]
			: []
	);

	function toActions(items: NavItem[]): ActionProps[] {
		return items.map((item) => ({ content: item.label, style: item.current ? 'theme' : 'normal' }));
	}

	// 현재 서버는 선택 표시만 하고 이동 동작을 두지 않는다.
	const guildActions = $derived<ActionProps[]>(
		guilds.length
			? guilds.map((g) => ({
					content: g.name,
					style: g.id === guild?.id ? 'theme' : 'normal',
					desc: g.id === guild?.id ? '현재 서버' : undefined,
					disabled: g.id === guild?.id
				}))
			: [{ content: '접근 가능한 서버가 없어요', disabled: true }]
	);

	function selectGuild(index: number) {
		const target = guilds[index];
		if (target) goto(resolve('/g/[guildId]', { guildId: target.id }));
	}

	function toggleMode() {
		mode = mode === 'dark' ? 'primary' : 'dark';
		setMode(mode);
	}
</script>

{#snippet modeIcon()}
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
		{#if mode === 'dark'}
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		{:else}
			<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
		{/if}
	</svg>
{/snippet}

{#snippet brand()}
	<a href={resolve('/')} class="flex shrink-0 items-center gap-2 no-underline" aria-label={`${SERVICE_NAME} 홈`}>
		<img src={asset('brand/logo.png')} alt="" width="32" height="32" class="size-8" />
		{#if desktop.current}
			<span class="font-brand text-2xl leading-none font-normal [font-synthesis:none]">{SERVICE_NAME}</span>
		{/if}
	</a>
{/snippet}

{#snippet guildSwitcher()}
	{#if user}
		<MenuButton label="서버 선택" actions={guildActions} onselect={selectGuild}>
			<span class="max-w-40 truncate text-sm font-semibold">{guild?.name ?? '서버 선택'}</span>
			<span aria-hidden="true">▾</span>
		</MenuButton>
	{/if}
{/snippet}

{#snippet desktopMenu()}
	<div class="flex items-center gap-1 pl-4">
		{#if primaryItems.length}
			<ContextNav items={primaryItems} label={scrim ? '내전 메뉴' : '서버 메뉴'} />
		{/if}
		{#if scrim}
			<MenuButton label="서버 메뉴" actions={toActions(guildItems)} onselect={(i) => goto(guildItems[i].href)}>
				<span class="text-sm font-semibold opacity-70">서버</span>
				<span aria-hidden="true">▾</span>
			</MenuButton>
		{/if}
	</div>
{/snippet}

{#snippet desktopTools()}
	<div class="flex items-center gap-1">
		{@render guildSwitcher()}
		<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-2" onclick={toggleMode}>
			{@render modeIcon()}
			<span class="sr-only">{mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}</span>
		</Button>
		{#if user}
			<MenuButton label="계정 메뉴" actions={toActions(accountItems)} onselect={(i) => goto(accountItems[i].href)}>
				<span
					class="flex size-8 items-center justify-center rounded-full bg-bg-highlight text-sm font-semibold dark:bg-bg-highlight-dark"
					aria-hidden="true"
				>
					{user.displayName.slice(0, 1)}
				</span>
				<span class="sr-only">계정 메뉴: {user.displayName}</span>
			</MenuButton>
		{/if}
	</div>
{/snippet}

{#snippet emptyTitle()}{/snippet}

{#snippet mobileTools()}
	<div class="flex items-center gap-1">
	{@render guildSwitcher()}
	<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-2" onclick={() => (menuOpen = true)}>
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
			<path d="M4 6h16M4 12h16M4 18h16" />
		</svg>
		<span class="sr-only">메뉴</span>
	</Button>
	</div>
{/snippet}

<header class="sticky top-0 z-50 border-b border-border bg-bg-base dark:bg-bg-base-dark">
	<div class="mx-auto max-w-(--app-header-width) px-2 lg:px-6">
		<NavBar
			line={false}
			injClass="h-(--app-header-height)! items-center bg-transparent! dark:bg-transparent! leading-normal!"
			leftChild={brand}
			titleChild={desktop.current ? desktopMenu : emptyTitle}
			rightChild={desktop.current ? desktopTools : mobileTools}
		/>
	</div>
</header>

{#if !desktop.current}
	<div {@attach overlay({ open: menuOpen, label: '메뉴', onclose: () => (menuOpen = false) })}>
		<Popup bind:visible={menuOpen} position="right" size={80}>
			<div class="flex h-full flex-col gap-6 overflow-y-auto p-4">
				{#if primaryItems.length}
					<ContextNav
						items={primaryItems}
						label={scrim ? '내전 메뉴' : '서버 메뉴'}
						vertical
						onnavigate={() => (menuOpen = false)}
					/>
				{/if}
				{#if scrim}
					<section class="flex flex-col gap-1">
						<h2 class="px-3 text-xs font-semibold opacity-60">서버</h2>
						<ContextNav items={guildItems} label="서버 메뉴" vertical onnavigate={() => (menuOpen = false)} />
					</section>
				{/if}
				{#if user}
					<section class="flex flex-col gap-1">
						<h2 class="px-3 text-xs font-semibold opacity-60">{user.displayName}</h2>
						<ContextNav items={accountItems} label="계정 메뉴" vertical onnavigate={() => (menuOpen = false)} />
					</section>
				{/if}
				<CellGroup my="0" mx="0" shadow="none">
					<SwitchCell title="다크 모드" active={mode === 'dark'} onchange={toggleMode} />
				</CellGroup>
			</div>
		</Popup>
	</div>
{/if}
