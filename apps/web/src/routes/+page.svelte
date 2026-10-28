<script lang="ts">
	import { Button } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';

	let confirmed = $state(false);
</script>

<svelte:head>
	<meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<section class="max-w-xl space-y-6">
	<h1 class="font-brand text-4xl font-normal [font-synthesis:none]">{SERVICE_NAME}</h1>
	<p>개발 환경 확인용 기본 페이지입니다.</p>
	<Button onclick={() => (confirmed = true)}>STDF 동작 확인</Button>
	<p role="status">
		{confirmed ? 'STDF 버튼이 정상적으로 동작합니다.' : '개발 환경이 준비되었습니다.'}
	</p>
</section>
