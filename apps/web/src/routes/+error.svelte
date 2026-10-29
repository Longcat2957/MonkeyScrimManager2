<script lang="ts">
	import { page } from '$app/state';
	import { Button } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';

	// 서버가 보낸 개발자용 문장을 그대로 노출하지 않고, 상태별 사용자 문장을 한 곳에서 정한다.
	const messages: Record<number, { title: string; description: string }> = {
		403: {
			title: '이 화면을 볼 권한이 없어요',
			description: '서버 접근 권한은 해당 서버 관리자에게 요청해 주세요.'
		},
		404: {
			title: '페이지를 찾을 수 없어요',
			description: '주소가 올바른지 확인해 주세요.'
		}
	};

	const message = $derived(
		messages[page.status] ?? {
			title: '페이지를 불러오지 못했어요',
			description: '잠시 후 다시 시도해 주세요.'
		}
	);
</script>

<svelte:head>
	<title>{page.status} | {SERVICE_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!--
	오류별 행동은 하나뿐이다.
	홈 이동은 헤더의 브랜드 링크가 이미 제공하므로 본문에 반복하지 않는다.
-->
<section class="measure px-1 py-16 sm:py-24" aria-labelledby="error-title">
	<p class="numeric-display text-display-l text-muted">{page.status}</p>
	<h1 id="error-title" class="mt-4 text-title-xl">{message.title}</h1>
	<p class="mt-2 text-body text-muted">{message.description}</p>

	{#if page.status >= 500}
		<div class="mt-8 max-w-40">
			<Button size="full" fill="base" state="theme" onclick={() => window.location.reload()}>
				다시 시도
			</Button>
		</div>
	{/if}
</section>
