<script lang="ts">
	import { Accordion } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';

	const TOC = [
		{ id: 'recruit', text: '모집 참여' },
		{ id: 'teams', text: '팀 편성' },
		{ id: 'bracket', text: '대진' },
		{ id: 'rofl', text: 'ROFL 업로드' },
		{ id: 'faq', text: '자주 묻는 질문' }
	];

	const FAQ = [
		{
			q: 'ROFL을 올렸는데 기록되지 않았어요.',
			a: '업로드 창의 파일 칸에 이유가 표시돼요. 읽을 수 없는 파일이거나 승패를 확인할 수 없는 파일, 이미 기록된 파일, 이미 끝난 경기는 기록하지 않아요. 연결이 끊겼다면 창을 닫은 뒤 경기 화면에서 실제로 기록됐는지 확인해 주세요.'
		},
		{
			q: '같은 파일을 두 번 올리면 어떻게 되나요?',
			a: '이미 기록된 게임 번호를 알려 주고 다시 기록하지 않아요.'
		},
		{
			q: '승패를 직접 입력할 수는 없나요?',
			a: '결과는 ROFL 파일로만 기록해요. 직접 입력으로 결과를 바꾸는 기능은 없어요.'
		},
		{
			q: '하드 피어리스에서 이미 쓴 챔피언을 골랐어요.',
			a: '경기 화면에 피어리스 표시가 붙고 다음 게임에서 쓸 수 없는 챔피언 목록에 안내돼요. 업로드나 결과 기록은 막지 않아요.'
		},
		{
			q: '선발이 아니라 대기로 표시돼요.',
			a: '신청 인원이 실제로 뛸 수 있는 정원보다 많으면 일부는 대기로 표시돼요. 상태는 내전 화면의 내 신청에서 확인할 수 있어요.'
		}
	];
</script>

<svelte:head>
	<title>이용 안내 | {SERVICE_NAME}</title>
</svelte:head>

<article class="doc">
	<h1>이용 안내</h1>
	<nav aria-label="목차" class="mt-4">
		<ul class="flex! flex-wrap gap-x-4 gap-y-1 pl-0! text-sm [list-style:none]!">
			{#each TOC as item (item.id)}
				<li class="mt-0!"><a href={`#${item.id}`} class="underline underline-offset-4">{item.text}</a></li>
			{/each}
		</ul>
	</nav>

	<h2 id="recruit">모집 참여</h2>
	<ol>
		<li>서버의 <strong>내전</strong> 메뉴에서 참가할 내전을 열어요.</li>
		<li><strong>신청하기</strong>를 눌러 참가에 쓸 Riot 계정과 희망 포지션을 고르고 신청해요. Riot 계정은 <strong>내 정보</strong>에서 먼저 연결해 두세요.</li>
		<li>모집이 끝나기 전까지는 <strong>내 신청</strong>에서 계정·포지션을 바꾸거나 신청을 철회할 수 있어요.</li>
	</ol>
	<p>모집이 끝나면 신청 상태가 선발 또는 대기로 바뀌어요.</p>

	<h2 id="teams">팀 편성</h2>
	<p>운영자가 내전을 만들 때 고른 방식으로 팀을 나눠요. 참가자는 같은 화면에서 진행 상황을 볼 수 있어요.</p>
	<h3>수동 편성</h3>
	<p>운영자가 참가자를 팀의 포지션 자리로 끌어 놓거나, 참가자를 누른 뒤 자리를 눌러 배치해요. 자리에 사람이 있으면 서로 바뀌어요. 모두 배치하고 <strong>편성 확정</strong>을 누르면 팀이 정해져요.</p>
	<h3>경매</h3>
	<p>운영자가 팀장과 팀별 시작 포인트를 정한 뒤 경매를 시작해요. 후보가 한 명씩 올라오면 팀마다 입찰가를 정해 낙찰하거나 유찰해요. 유찰된 후보는 후보 목록에서 다시 올리거나 팀에 바로 배치할 수 있어요. 모든 팀이 다 차면 경매가 끝나요.</p>

	<h2 id="bracket">대진</h2>
	<p>팀 편성이 끝나면 운영자가 팀을 대진 자리에 배치하고 준결승·결승의 경기 방식(단판, 3전 2선승, 5전 3선승)을 정한 뒤 <strong>대진 확정</strong>을 눌러요.</p>
	<ul>
		<li>2팀은 결승 한 경기예요.</li>
		<li>3팀은 준결승 한 경기와 결승 직행 자리 하나예요.</li>
		<li>4팀은 준결승 두 경기의 승자끼리 결승을 치러요.</li>
	</ul>
	<p>경기가 시작되기 전에는 운영자가 <strong>다시 편성</strong>으로 확정을 풀 수 있어요.</p>

	<h2 id="rofl">ROFL 업로드</h2>
	<ol>
		<li>게임이 끝나면 League of Legends 클라이언트에서 리플레이 파일(.rofl)을 저장해요.</li>
		<li><strong>경기 기록</strong>에서 진행 중인 경기를 열고 <strong>ROFL 업로드</strong>를 눌러요.</li>
		<li>파일을 고르고 <strong>업로드</strong>를 누르면 파일마다 차례로 확인한 뒤 다음 게임으로 기록해요.</li>
	</ol>
	<p>정상 파일은 승인 없이 바로 기록되고, 한 팀이 과반을 이기면 경기가 끝나요. 원본 파일은 보관하지 않아요.</p>

	<h2 id="faq">자주 묻는 질문</h2>
	<div class="mt-3">
		<Accordion items={FAQ.map((item) => ({ title: item.q }))} border="solid">
			{#snippet children(_item: unknown, index: number)}
				<p class="mt-0! pb-3 text-sm">{FAQ[index]?.a}</p>
			{/snippet}
		</Accordion>
	</div>
</article>
