<script lang="ts">
	import { Button, CellGroup, ImageList, Input, Popup, toast } from 'stdf';
	import type { ImageListItemProps } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import LinkCell from '#lib/components/common/LinkCell.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
	import { demoScrim, demoStatuses } from '#lib/mocks/component-demo/index.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	let popupOpen = $state(false);
	let title = $state('');
	let titleError = $state('');
	let confirmResult = $state('');
	let files: ImageListItemProps[] = $state([]);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		titleError = title.trim() ? '' : '제목을 입력해 주세요';
		if (titleError) return;
		popupOpen = false;
		toast.success('저장했어요');
	}

	async function askConfirm() {
		confirmResult = (await confirm('이 작업을 진행할까요?', '확인')) ? '확인함' : '취소함';
	}
</script>

<svelte:head>
	<title>컴포넌트 테스트 | {SERVICE_NAME}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">컴포넌트 테스트</h1>

<div class="mt-8 flex flex-col gap-12">
	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">ScrimSummary</h2>
		<ScrimSummary scrim={demoScrim} />
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">상태 Tag</h2>
		<div class="flex flex-wrap gap-2">
			{#each demoStatuses as status (status.key)}
				<StatusTag text={status.text} state={status.state} />
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">LinkCell</h2>
		<CellGroup my="0" mx="0" shadow="none">
			<ul>
				<li>
					<LinkCell href="#main-content" title="10월 정기 내전" subTitle="토 20:00 · 수동 편성 · 신청 8/12명" line info="신청함">
						{#snippet detailChild()}<StatusTag text="모집 중" state="theme" />{/snippet}
					</LinkCell>
				</li>
				<li><LinkCell href="#main-content" title="제목만 있는 행" detail="10/24" /></li>
			</ul>
		</CellGroup>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">SectionState</h2>
		<SectionState state="loading" />
		<SectionState state="empty" message="아직 내전이 없어요" />
		<SectionState state="error" message="목록을 불러오지 못했어요" onretry={() => new Promise((r) => setTimeout(r, 800))} />
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">Button</h2>
		<div class="flex flex-wrap items-center gap-2">
			<Button size="auto" heightOut="0" injClass="px-4">주 작업</Button>
			<Button fill="lineLight" size="auto" heightOut="0" injClass="px-4">보조 작업</Button>
			<Button fill="text" state="error" size="auto" heightOut="0" injClass="px-4">위험 작업</Button>
			<Button size="auto" heightOut="0" injClass="px-4" loading={{}}>저장 중</Button>
			<Button size="auto" heightOut="0" injClass="px-4" disabled>비활성</Button>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">오버레이</h2>
		<p class="text-sm opacity-70">포커스 이동, Escape 닫기, 배경 inert, 닫은 뒤 포커스 복귀를 확인한다.</p>
		<div class="flex flex-wrap items-center gap-2">
			<Button fill="lineLight" size="auto" heightOut="0" injClass="px-4" onclick={() => (popupOpen = true)}>
				입력 팝업 열기
			</Button>
			<Button fill="lineLight" size="auto" heightOut="0" injClass="px-4" onclick={askConfirm}>확인 창 열기</Button>
			{#if confirmResult}<span class="text-sm">{confirmResult}</span>{/if}
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-lg font-semibold">ImageList (.rofl)</h2>
		<ImageList bind:value={files} accept=".rofl" multiple max={3} radius="md" previewable={false}>
			{#snippet uploadChild()}
				<span class="flex h-full items-center justify-center p-2 text-xs font-semibold">ROFL 선택</span>
			{/snippet}
			{#snippet itemChild(item)}
				<span class="block truncate p-2 text-xs">{item.file?.name ?? item.id}</span>
			{/snippet}
		</ImageList>
	</section>
</div>

<div {@attach overlay({ open: popupOpen, label: '모집 만들기', onclose: () => (popupOpen = false) })}>
	<Popup bind:visible={popupOpen} position={desktop.current ? 'center' : 'bottom'} size={0} maskClosable={false} transparent>
		<form
			class="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
			onsubmit={submit}
			novalidate
		>
			<h2 class="text-lg font-semibold">모집 만들기</h2>
			<Input
				title="제목"
				titlePosition="out"
				bind:value={title}
				placeholder="예: 10월 정기 내전"
				state={titleError ? 'error' : 'theme'}
				tip={titleError}
				required
				maxlength={50}
			/>
			<div class="flex justify-end gap-2">
				<Button type="button" fill="lineLight" size="auto" heightOut="0" injClass="px-4" onclick={() => (popupOpen = false)}>
					취소
				</Button>
				<Button type="submit" size="auto" heightOut="0" injClass="px-4">만들기</Button>
			</div>
		</form>
	</Popup>
</div>
