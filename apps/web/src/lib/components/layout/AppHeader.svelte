<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';
	import { REPOSITORY_URL, SERVICE_NAME } from '#lib/branding.ts';

	let mobileOpen = $state(false);
	let isDark = $state(false);
	let mobileMenu: HTMLDetailsElement | undefined = $state();
	let menuButton: HTMLElement | undefined = $state();

	onMount(() => {
		isDark = document.documentElement.dataset.mode === 'dark';
	});

	function toggleTheme() {
		isDark = document.documentElement.dataset.mode !== 'dark';
		const mode = isDark ? 'dark' : 'primary';
		document.documentElement.dataset.mode = mode;
		try {
			localStorage.setItem('theme-mode', mode);
		} catch {
			// 저장이 불가능해도 현재 화면의 테마 전환은 유지한다.
		}
		mobileOpen = false;
	}
</script>

<svelte:document
	onkeydown={(event) => {
		if (event.key === 'Escape' && mobileOpen) {
			mobileOpen = false;
			menuButton?.focus();
		}
	}}
	onclick={(event) => {
		if (mobileOpen && event.target instanceof Node && !mobileMenu?.contains(event.target)) {
			mobileOpen = false;
		}
	}}
/>

{#snippet navigationLinks()}
	<a
		href={resolve('/')}
		class="nav-link"
		aria-current={page.route.id === '/' ? 'page' : undefined}
		onclick={() => (mobileOpen = false)}
	>
		홈
	</a>
	<a
		href={REPOSITORY_URL}
		class="nav-link"
		target="_blank"
		rel="noreferrer"
		aria-label="GitHub 저장소 (새 창)"
	>
		GitHub <span aria-hidden="true">↗</span>
	</a>
{/snippet}

{#snippet themeToggle()}
	<button
		type="button"
		class="nav-action"
		onclick={toggleTheme}
		aria-label="다크 모드"
		aria-pressed={isDark}
		title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
	>
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			{#if isDark}
				<circle cx="12" cy="12" r="4" />
				<path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
			{:else}
				<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
			{/if}
		</svg>
	</button>
{/snippet}

<header
	class="sticky top-0 z-50 h-(--app-header-height) border-b border-border bg-bg-base dark:bg-bg-base-dark"
>
	<div
		class="mx-auto flex h-full max-w-(--app-header-width) items-center justify-between px-4 lg:px-8"
	>
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-3 font-semibold no-underline"
			aria-label={`${SERVICE_NAME} 홈`}
		>
			<img src={asset('brand/logo.png')} alt="" width="32" height="32" class="size-8" />
			<span class="font-brand text-2xl leading-none font-normal [font-synthesis:none]">
				{SERVICE_NAME}
			</span>
		</a>

		<nav aria-label="주 내비게이션" class="hidden items-center gap-1 lg:flex">
			{@render navigationLinks()}
			<span class="mx-2 h-5 border-l border-border" aria-hidden="true"></span>
			{@render themeToggle()}
		</nav>

		<details class="relative lg:hidden" bind:this={mobileMenu} bind:open={mobileOpen}>
			<summary class="nav-action menu-summary" bind:this={menuButton} aria-label="내비게이션 메뉴">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					{#if mobileOpen}
						<path d="m6 6 12 12M6 18 18 6" />
					{:else}
						<path d="M4 6h16M4 12h16M4 18h16" />
					{/if}
				</svg>
			</summary>
			<nav
				aria-label="모바일 내비게이션"
				class="mobile-nav absolute top-full right-0 mt-3 grid w-60 max-w-[calc(100vw-2rem)] gap-2 border border-border bg-bg-surface p-3 dark:bg-bg-surface-dark"
			>
				{@render navigationLinks()}
				<div class="mt-1 flex items-center justify-between border-t border-border pt-3">
					<span class="text-sm">화면 테마</span>
					{@render themeToggle()}
				</div>
			</nav>
		</details>
	</div>
</header>

<style>
	.nav-link,
	.nav-action {
		display: inline-flex;
		min-height: 2.25rem;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		border: 1px solid transparent;
		border-radius: 0;
		padding: 0 0.75rem;
		background: transparent;
		color: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		opacity: 0.72;
		cursor: pointer;
	}

	.nav-link:hover,
	.nav-link[aria-current='page'],
	.nav-action:hover,
	.nav-action[aria-pressed='true'] {
		border-color: var(--color-border);
		opacity: 1;
	}

	.nav-link[aria-current='page'] {
		color: var(--color-primary);
	}

	:global(html[data-mode='dark']) .nav-link[aria-current='page'] {
		color: var(--color-dark);
	}

	a:focus-visible,
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 3px;
	}

	.nav-action {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
	}

	.menu-summary {
		border-color: var(--color-border);
		list-style: none;
		opacity: 1;
	}

	.menu-summary::-webkit-details-marker {
		display: none;
	}

	.mobile-nav .nav-link {
		justify-content: flex-start;
		border-color: var(--color-border);
	}
</style>
