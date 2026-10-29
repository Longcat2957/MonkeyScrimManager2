<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ActionSheet,
		Accordion,
		Badge,
		Button,
		Cell,
		CellGroup,
		Input,
		Progress,
		Steps
	} from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import AppHeader from '#lib/components/shell/AppHeader.svelte';
	import AsyncSection from '#lib/components/ui/AsyncSection.svelte';
	import ChoiceGroup from '#lib/components/ui/ChoiceGroup.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import TaskDialog from '#lib/components/ui/TaskDialog.svelte';
	import { MATCH_STATUS, POSITION_LABEL, REGISTRATION_STATUS, SCRIM_STATUS } from '#lib/components/ui/status.ts';
	import type { Loadable } from '#lib/data/types.ts';


	type Scenario = 'normal' | 'empty' | 'slow' | 'error';
	const SCENARIOS: { value: Scenario; label: string }[] = [
		{ value: 'normal', label: '정상' },
		{ value: 'empty', label: '빈 데이터' },
		{ value: 'slow', label: '로딩' },
		{ value: 'error', label: '오류' }
	];

	const scenario = $derived((page.url.searchParams.get('scenario') ?? 'normal') as Scenario);

	function setScenario(value: Scenario) {
		const url = new URL(String(page.url));
		url.searchParams.set('scenario', value);
		goto(url, { replace: true, shallow: true, reset: false });
	}

	let taskOpen = $state(false);
	let confirmOpen = $state(false);
	let sheetOpen = $state(false);
	let demoChoice = $state<'all' | 'recruit'>('all');
	let demoText = $state('');

	const sample = $derived.by((): Loadable<string[]> => {
		if (scenario === 'error') return { status: 'error', message: '예시 오류: 서버가 응답하지 않습니다.' };
		if (scenario === 'empty') return { status: 'ready', data: [] };
		return { status: 'ready', data: ['첫 번째 항목', '두 번째 항목'] };
	});

	const rowLinks = [
		{ title: '월요 정규전', meta: '10월 27일 (화) 21:00 · 엔트리 편성', num: '10 / 10', state: 'live' as const },
		{ title: '수요 내전', meta: '10월 29일 (목) 20:00 · 경매 편성', num: '7 / 10', state: 'wait' as const }
	];
</script>

<svelte:head>
	<title>컴포넌트 갤러리 | {SERVICE_NAME}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<h1 class="page-title">컴포넌트 갤러리</h1>
<p class="mt-1.5 text-[13px] text-mut">새 시각 규칙(표면 램프·행·상태·버튼)을 한 화면에서 확인한다.</p>

<div class="mt-6 flex flex-wrap gap-2">
	{#each SCENARIOS as item (item.value)}
		<label class="chip">
			<input
				type="radio"
				name="scenario"
				value={item.value}
				checked={scenario === item.value}
				class="sr-only"
				onchange={() => setScenario(item.value)}
			/>
			{item.label}
		</label>
	{/each}
</div>

<section class="mt-10" aria-labelledby="type">
	<div class="region"><span class="lbl" id="type">타입</span></div>
	<div class="panel space-y-2 p-5">
		<p class="page-title">페이지 제목 24/800</p>
		<p class="text-[18px] font-extrabold">섹션 제목 18/800</p>
		<p class="text-[15px] font-bold">소제목 15/700</p>
		<p class="text-[14px]">본문 14/400 — 내전 결과는 ROFL 파일로 자동 기록됩니다.</p>
		<p class="text-[12.5px] text-mut">보조 12.5/400 — 서브 정보와 안내</p>
		<p class="lbl">구역 라벨 14/700</p>
		<p class="count">보조 11.5 — 라벨 아래 한 줄</p>
		<p class="font-brand text-[44px] leading-none">128 7 / 10 :</p>
	</div>
</section>

<section class="mt-8" aria-labelledby="colors">
	<div class="region"><span class="lbl" id="colors">색·상태</span></div>
	<div class="grid gap-3 sm:grid-cols-2">
		<div class="panel p-4">
			<p class="lbl mb-2">상태</p>
			<div class="flex flex-col gap-2">
				<StatusState status={SCRIM_STATUS.recruit} />
				<StatusState status={SCRIM_STATUS.preparing} />
				<StatusState status={SCRIM_STATUS.completed} />
				<StatusState status={SCRIM_STATUS.cancelled} />
				<StatusState status={REGISTRATION_STATUS.selected} />
				<StatusState status={REGISTRATION_STATUS.pending} />
				<StatusState status={MATCH_STATUS.ended_early} />
			</div>
		</div>
		<div class="panel p-4">
			<p class="lbl mb-2">표면 단</p>
			<div class="grid grid-cols-4 gap-2 text-center text-[10px]">
				<div class="bg-surface-app border border-line py-4 text-faint">app</div>
				<div class="bg-panel border border-line py-4 text-faint">panel</div>
				<div class="bg-panel-2 border border-line py-4 text-faint">panel-2</div>
				<div class="bg-inset border border-line py-4 text-faint">inset</div>
			</div>
			<div class="mt-3 flex items-center gap-3 text-[11px]">
				<span class="text-accent">accent</span>
				<span class="text-gold">gold</span>
				<span class="text-rose">rose</span>
				<span class="text-mut">mut</span>
				<span class="text-faint">faint</span>
			</div>
		</div>
	</div>
</section>

<section class="mt-8" aria-labelledby="controls">
	<div class="region"><span class="lbl" id="controls">버튼·입력</span></div>
	<div class="panel space-y-4 p-5">
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="btn btn--primary">주 행동</button>
			<button type="button" class="btn">보조 행동</button>
			<button type="button" class="btn btn--danger">위험</button>
			<button type="button" class="btn btn--text">텍스트</button>
			<button type="button" class="btn" disabled>비활성</button>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<label class="chip"><input type="radio" name="chip-demo" class="sr-only" checked />칩 선택됨</label>
			<label class="chip"><input type="radio" name="chip-demo" class="sr-only" />칩</label>
			<select class="field w-40"><option>선택</option></select>
			<input type="number" class="field w-24 text-end" value="0" />
		</div>
		<div class="max-w-sm">
			<Input title="STDF Input" placeholder="예: 30일 밤 내전" py="2" bind:value={demoText} />
		</div>
		<ChoiceGroup
			legend="상태 필터"
			name="gallery-status"
			options={[
				{ value: 'all', label: '전체' },
				{ value: 'recruit', label: '모집 중' }
			]}
			bind:value={demoChoice}
		/>
	</div>
</section>

<section class="mt-8" aria-labelledby="surfaces">
	<div class="region"><span class="lbl" id="surfaces">패널·행·지표</span></div>
	<div class="space-y-3">
		<article class="hero">
			<div class="hero-main">
				<StatusState status={SCRIM_STATUS.recruit} />
				<p class="hero-title">30일 밤 내전 #12</p>
				<p class="hero-meta">10월 30일 (금) 20:00 · 2팀 10인 · 경매 편성</p>
			</div>
			<div class="hero-score">
				<div class="score"><b>7</b><span>/ 10 선발</span></div>
				<div class="meter"><i style:width="70%"></i></div>
				<button type="button" class="btn btn--primary w-full">내전 열기</button>
			</div>
		</article>

		<div class="panel">
			{#each rowLinks as row (row.title)}
				<div class="row">
					<div class="min-w-0">
						<p class="row-title">{row.title}</p>
						<p class="row-meta">{row.meta}</p>
					</div>
					<p class="row-num">{row.num}</p>
					<div class="row-side"><StatusState status={SCRIM_STATUS[row.state === 'live' ? 'in_progress' : 'preparing']} /></div>
				</div>
			{/each}
		</div>

		<div class="stats grid-cols-1 sm:grid-cols-3">
			<div class="stat"><span>완료 Game</span><b>128<small>경기</small></b></div>
			<div class="stat"><span>참가 사용자</span><b>46<small>명</small></b></div>
			<div class="stat"><span>평균 경기 길이</span><b>31<small>분 24초</small></b></div>
		</div>

		<div class="panel data-table-container px-5 py-2">
			<table class="data-table">
				<caption class="sr-only">표 예시</caption>
				<thead>
					<tr>
						<th scope="col">포지션</th>
						<th scope="col" class="text-end">표본</th>
						<th scope="col" class="text-end">평균 KDA</th>
					</tr>
				</thead>
				<tbody>
					{#each ['top', 'jungle', 'mid'] as const as position (position)}
						<tr>
							<th scope="row">{POSITION_LABEL[position]}</th>
							<td data-label="표본" class="tabular text-end">12</td>
							<td data-label="평균 KDA" class="tabular text-end">3.41</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>

<section class="mt-8" aria-labelledby="stdf">
	<div class="region"><span class="lbl" id="stdf">STDF 컴포넌트</span></div>
	<div class="grid gap-3 lg:grid-cols-2">
		<div class="panel p-5">
			<Steps
				steps={[{ step: { title: '모집' } }, { step: { title: '편성' } }, { step: { title: '경기' } }, { step: { title: '기록' } }]}
				current={2}
			/>
			<div class="mt-5 flex items-center gap-3">
				<span class="relative inline-flex">
					<Badge text="3" isShow />
				</span>
				<div class="flex-1"><Progress percent={70} percentPosition={null} /></div>
			</div>
		</div>

		<div class="panel p-5">
			<Accordion
				items={[{ title: '하드 피어리스 사용 챔피언', content: '' }]}
				expandIcon="plus"
			>
				{#snippet children()}
					<ul class="flex flex-wrap gap-2">
						{#each ['아트록스', '리 신', '아지르'] as champion (champion)}
							<li class="border border-line px-2.5 py-1 text-[12px] text-mut">{champion}</li>
						{/each}
					</ul>
				{/snippet}
			</Accordion>
		</div>

		<div class="panel p-2">
			<CellGroup>
				<Cell title="참가자 01" detail="참가자01#KR1" info="관리자" right="arrow" bg="gray" my="0" onclick={() => (sheetOpen = true)} />
				<Cell title="참가자 02" detail="참가자02#KR1" info="일반" right="arrow" bg="gray" my="0" onclick={() => (sheetOpen = true)} />
			</CellGroup>
		</div>

		<div class="panel p-5">
			<AsyncSection result={sample} label="비동기" emptyText="표시할 항목이 없습니다." loading={scenario === 'slow'}>
				{#snippet children(items)}
					<ul class="space-y-1 text-[13px]">{#each items as item (item)}<li>{item}</li>{/each}</ul>
				{/snippet}
			</AsyncSection>
		</div>
	</div>
</section>

<section class="mt-8" aria-labelledby="overlays">
	<div class="region"><span class="lbl" id="overlays">오버레이</span></div>
	<div class="panel flex flex-wrap gap-2 p-5">
		<button type="button" class="btn" onclick={() => (taskOpen = true)}>TaskDialog</button>
		<button type="button" class="btn" onclick={() => (confirmOpen = true)}>ConfirmDialog</button>
		<button type="button" class="btn" onclick={() => (sheetOpen = true)}>ActionSheet</button>
	</div>
</section>

<section class="mt-8" aria-labelledby="headers">
	<div class="region"><span class="lbl" id="headers">헤더 변형</span></div>
	<div class="space-y-6">
		<div class="overflow-hidden border border-line">
			<AppHeader />
		</div>
	</div>
</section>

<TaskDialog
	bind:open={taskOpen}
	title="모집 생성"
	description="생성하면 서버의 내전 목록 맨 위에 추가됩니다."
	submitLabel="생성"
	pending={false}
	canSubmit={true}
	onsubmit={() => (taskOpen = false)}
	onclosed={() => (taskOpen = false)}
>
	<div class="space-y-4">
		<Input title="내전 제목" py="2" placeholder="예: 30일 밤 내전" />
	</div>
</TaskDialog>

<ConfirmDialog
	bind:open={confirmOpen}
	title="모집을 마감할까요?"
	content="마감하면 더 이상 새 신청을 받지 않습니다."
	confirmLabel="마감"
	onconfirm={() => (confirmOpen = false)}
/>

<ActionSheet
	bind:visible={sheetOpen}
	title="참가자 01 처리"
	actions={[{ content: '선발' }, { content: '대기' }, { content: '제외', style: 'error' }]}
	showCancel
	cancelText="닫기"
	onclickAction={() => (sheetOpen = false)}
	onclose={() => (sheetOpen = false)}
/>
