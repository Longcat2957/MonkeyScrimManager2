<script lang="ts">
	import { resolve } from '$app/paths';
	import { SERVICE_NAME, SERVICE_URL } from '#lib/branding.ts';

	const serviceDomain = new URL(SERVICE_URL).hostname;
	const footerLinks = [
		{ label: '문서', path: '/docs' },
		{ label: '이용약관', path: '/terms' },
		{ label: '개인정보 처리방침', path: '/privacy' }
	] as const;
</script>

<footer class="border-t border-border">
	<div
		class="app-frame flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between md:px-10"
	>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span
				class="font-brand text-xl font-normal no-underline [font-synthesis:none]"
			>
				{SERVICE_NAME}
			</span>
			<span
				class="text-xs text-text-primary/60 dark:text-text-dark/60"
			>
				{serviceDomain}
			</span>
		</div>

		<nav aria-label="서비스 정책 및 안내" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
			{#each footerLinks as link (link.path)}
				<a
					href={resolve(link.path)}
					class={['footer-link', { 'font-semibold': link.path === '/privacy' }]}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>
</footer>

<style>
	.footer-link {
		text-decoration: none;
		text-underline-offset: 0.25em;
	}

	.footer-link:hover {
		text-decoration: underline;
	}

	a:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}
</style>
