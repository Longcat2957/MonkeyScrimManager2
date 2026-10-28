<script lang="ts">
	import { Button } from 'stdf';

	let confirmed = $state(false);
</script>

<svelte:head>
	<title>MonkeyScrimManager2</title>
	<meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<main class="min-h-screen bg-bg-base px-6 py-16 text-text-primary">
	<div class="mx-auto max-w-xl space-y-6">
		<h1 class="text-3xl font-bold">MonkeyScrimManager2</h1>
		<p>개발 환경 확인용 기본 페이지입니다.</p>
		<Button onclick={() => (confirmed = true)}>STDF 동작 확인</Button>
		<p role="status">{confirmed ? 'STDF 버튼이 정상적으로 동작합니다.' : '개발 환경이 준비되었습니다.'}</p>
	</div>
</main>
