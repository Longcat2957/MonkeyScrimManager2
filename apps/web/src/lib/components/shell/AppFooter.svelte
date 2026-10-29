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

<!-- 워드마크는 표시용 텍스트다. 홈 이동은 헤더의 브랜드 링크 한 곳이 담당한다. -->
<footer class="mt-auto border-t border-line">
	<div
		class="shell flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span class="font-brand text-xl leading-none font-normal text-fg [font-synthesis:none]">{SERVICE_NAME}</span>
			<span class="text-[11px] text-faint">{serviceDomain}</span>
		</div>

		<nav aria-label="서비스 정책 및 안내" class="flex flex-wrap items-center gap-x-4 gap-y-1">
			{#each footerLinks as link (link.path)}
				<a
					href={resolve(link.path)}
					class="rounded-sm text-[11px] text-faint underline-offset-4 hover:text-fg hover:underline"
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>
</footer>
