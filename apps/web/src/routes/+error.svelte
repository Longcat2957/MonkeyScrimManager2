<script lang="ts">
	import { page } from '$app/state';
	import { Button } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';

	const messages: Record<number, { title: string; description: string }> = {
		403: {
			title: '접근 권한이 없어요',
			description: '운영자에게 이용 권한을 요청해 주세요.'
		},
		404: {
			title: '페이지를 찾을 수 없어요',
			description: '주소가 올바른지 확인해 주세요.'
		}
	};
	const message = $derived(messages[page.status] ?? {
		title: '페이지를 불러오지 못했어요',
		description: '잠시 후 다시 시도해 주세요.'
	});
</script>

<svelte:head>
	<title>{page.status} | {SERVICE_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section aria-labelledby="error-title" class="mx-auto max-w-lg py-16 text-center sm:py-24">
	<p class="text-8xl font-semibold tracking-tight text-primary/60 dark:text-dark/60">{page.status}</p>
	<h1 id="error-title" class="mt-6 text-2xl font-semibold text-balance">{message.title}</h1>
	<p class="mt-3 text-sm leading-relaxed text-pretty opacity-70">{message.description}</p>
	{#if page.status >= 500}
		<div class="mx-auto mt-8 w-36">
			<Button size="full" fill="lineLight" heightOut="0" onclick={() => window.location.reload()}>
				다시 시도
			</Button>
		</div>
	{/if}
</section>
