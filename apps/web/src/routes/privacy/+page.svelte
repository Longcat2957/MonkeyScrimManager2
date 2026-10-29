<script lang="ts">
	import { pageTitle } from '#lib/shell/titles.ts';
</script>

<svelte:head>
	<title>{pageTitle('개인정보 처리방침')}</title>
</svelte:head>

<h1 class="page-title">개인정보 처리방침</h1>
<p class="mt-1.5 text-[13px] text-mut">적용일은 처리방침이 확정된 뒤 표시합니다.</p>

<div class="measure mt-8 panel px-5 py-5">
	<p class="text-[13.5px]">아직 발행된 처리방침이 없습니다. 확정되면 적용일과 함께 이 화면에 게시합니다.</p>
	<ul class="mt-3 list-disc space-y-1 pl-5 text-[13px] text-mut">
		<li>Discord 계정 식별 정보와 Riot 계정 연결 정보의 처리</li>
		<li>경기 기록에서 사용하는 표시 이름·Riot ID·성적의 보관과 공개 범위</li>
		<li>ROFL 원본 파일을 보관하지 않는 원칙</li>
	</ul>
	<p class="mt-3 text-[13px] text-mut">개인 공개 범위는 <a class="text-accent underline-offset-4 hover:underline" href="/me">내 정보</a>에서 바꿉니다.</p>
</div>
