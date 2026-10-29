<script lang="ts">
	import { pageTitle } from '#lib/shell/titles.ts';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
</script>

<svelte:head>
	<title>{pageTitle('이용약관')}</title>
</svelte:head>

<PageHeader title="이용약관" description="적용일은 약관이 확정된 뒤 표시합니다." />

<div class="measure space-y-4 border-t border-line pt-4">
	<p class="text-body">아직 발행된 약관이 없습니다. 확정되면 적용일과 함께 이 화면에 게시합니다.</p>
	<ul class="list-disc space-y-1 pl-5 text-body text-muted">
		<li>서비스 이용 조건과 계정 책임 범위</li>
		<li>경기 기록·전적의 공개 범위</li>
		<li>운영 권한과 제재의 기준</li>
	</ul>
</div>
