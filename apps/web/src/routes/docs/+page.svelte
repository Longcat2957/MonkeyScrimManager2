<script lang="ts">
	import { pageTitle } from '#lib/shell/titles.ts';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
</script>

<svelte:head>
	<title>{pageTitle('문서')}</title>
</svelte:head>

<PageHeader title="이용 문서" description="모집 참여부터 경기 기록까지, 필요한 절차만 모았습니다." />

<div class="measure space-y-10">
	<nav aria-label="목차">
		<ul class="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-body-s">
			<li><a class="underline-offset-4 hover:underline" href="#join">모집 참여</a></li>
			<li><a class="underline-offset-4 hover:underline" href="#formation">팀 편성</a></li>
			<li><a class="underline-offset-4 hover:underline" href="#record">경기 기록</a></li>
			<li><a class="underline-offset-4 hover:underline" href="#blocked">막혔을 때</a></li>
		</ul>
	</nav>

	<section id="join" class="scroll-mt-32" aria-labelledby="join-title">
		<h2 id="join-title" class="text-title-l">모집 참여</h2>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-body">
			<li>헤더 오른쪽에서 서버를 고르고, 내전 목록에서 참가할 내전을 엽니다.</li>
			<li>요약 화면의 <strong>참가 신청</strong>에서 희망 포지션을 고릅니다. 2순위는 선택 사항입니다.</li>
			<li>신청 후 상태는 참가자 명단의 내 행에서 확인합니다. 신청·선발·대기·철회를 구분해 표시합니다.</li>
		</ol>
		<p class="mt-3 text-body text-muted">
			정원보다 신청이 많으면 운영자가 선발과 대기를 정합니다. 신청 순서로 자동 선발되지 않습니다.
		</p>
	</section>

	<section id="formation" class="scroll-mt-32" aria-labelledby="formation-title">
		<h2 id="formation-title" class="text-title-l">팀 편성</h2>
		<p class="mt-3 text-body">
			편성 방식은 내전을 만들 때 정합니다. <strong>엔트리 편성</strong>은 참가자를 직접 팀·포지션에 배정하고,
			<strong>경매 편성</strong>은 팀장이 포인트로 참가자를 영입합니다.
		</p>
		<p class="mt-2 text-body text-muted">
			방식은 팀 편성 화면에서 바꾸지 않습니다. 경기가 시작된 뒤에는 팀을 다시 편성하지 않고 새 내전을 모집합니다.
		</p>
	</section>

	<section id="record" class="scroll-mt-32" aria-labelledby="record-title">
		<h2 id="record-title" class="text-title-l">경기 기록</h2>
		<p class="mt-3 text-body">
			경기 결과는 ROFL 파일로 자동 기록됩니다. 서버가 권한·참가자 연결·중복·결과를 확인한 뒤 저장하며,
			정상 파일은 사람의 승인 없이 기록됩니다.
		</p>
		<p class="mt-2 text-body text-muted">서비스는 ROFL 원본 파일을 보관하지 않습니다. 재분석이 필요하면 파일을 다시 올립니다.</p>
	</section>

	<section id="blocked" class="scroll-mt-32" aria-labelledby="blocked-title">
		<h2 id="blocked-title" class="text-title-l">막혔을 때</h2>
		<dl class="mt-3 space-y-3 text-body">
			<div>
				<dt class="font-semibold">참가 신청 버튼이 없습니다.</dt>
				<dd class="text-muted">모집이 마감되었거나 신청 정원이 찼을 수 있습니다. 요약 화면의 "지금" 문장에서 이유를 확인합니다.</dd>
			</div>
			<div>
				<dt class="font-semibold">팀 편성에서 배정이 되지 않습니다.</dt>
				<dd class="text-muted">선발 인원이 실출전 정원과 같아야 편성을 시작할 수 있습니다.</dd>
			</div>
			<div>
				<dt class="font-semibold">경기 결과가 보이지 않습니다.</dt>
				<dd class="text-muted">결과 등록 전이거나 참가자 연결이 맞지 않아 예외로 처리된 상태일 수 있습니다.</dd>
			</div>
		</dl>
	</section>
</div>
