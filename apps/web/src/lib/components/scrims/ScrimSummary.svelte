<script lang="ts">
	import { Steps } from 'stdf';
	import type { StepsItemProps } from 'stdf';
	import { formatSchedule, formationMethodLabel, SCRIM_STATUS } from '#lib/features/labels.ts';
	import type { ScrimContext, ScrimStatus } from '#lib/features/scrims/types.ts';

	// artUrl은 장식용 배경 아트다. 없으면 어두운 배경색만 쓴다.
	let { scrim, artUrl = null }: { scrim: ScrimContext; artUrl?: string | null } = $props();

	const STEP_TITLES = ['모집', '편성', '대진', '진행', '종료'];
	// STDF Steps의 current는 1부터 센다. 종료는 마지막 단계까지 완료로 표시한다.
	// 중도 종료·취소는 단계 흐름에서 벗어난 상태이므로 Steps 없이 Tag만 표시한다.
	const STEP_INDEX: Partial<Record<ScrimStatus, number>> = {
		recruit: 1,
		preparing: 2,
		ready: 3,
		in_progress: 4,
		completed: STEP_TITLES.length + 1
	};

	const status = $derived(SCRIM_STATUS[scrim.status]);
	// 밝은 바탕용 Tag 색은 어두운 카드에서 묻히므로 상태색은 점으로만 쓰고 글자는 흰색으로 둔다.
	const DOT: Record<typeof status.state, string> = {
		theme: 'bg-white',
		success: 'bg-success',
		warning: 'bg-warning',
		error: 'bg-error',
		info: 'bg-info',
		neutral: 'bg-white/60'
	};
	const current = $derived(STEP_INDEX[scrim.status]);
	// 단계마다 번호 막대를 두고, 끝난 단계는 체크로 바꿔 완료·현재·예정을 모양으로 구분한다.
	const steps: StepsItemProps[] = STEP_TITLES.map((title, index) => ({
		step: { title, bar: { type: 'string', content: String(index + 1) } },
		finishStep: { title, bar: { type: 'string', content: '✓' } }
	}));
	const stepState = (index: number) =>
		current === undefined ? 'upcoming' : index < current - 1 ? 'complete' : index === current - 1 ? 'current' : 'upcoming';
	const STEP_STATE_TEXT = { complete: '완료', current: '현재 단계', upcoming: '예정' };
	const meta = $derived(
		[
			formatSchedule(scrim.scheduledAt),
			`${scrim.teamCount}팀`,
			formationMethodLabel(scrim.formationMethod),
			scrim.hardFearless ? '하드 피어리스' : null
		].filter((item): item is string => Boolean(item))
	);
</script>

<!--
	내전 하위 세 페이지의 머리. 서버 홈 첫 카드와 같이 화면 모드와 관계없이 어두운 바탕에 배경 아트를 깐다.
	진행 단계는 STDF Steps의 밝은 바탕 색을 그대로 쓰도록 카드 아래에 둔다.
-->
<header class="mb-8 flex flex-col gap-6 border-b border-border pb-6">
	<div class="relative isolate overflow-hidden rounded-(--radius-box) bg-bg-base-dark text-text-dark ring-1 ring-white/10">
		{#if artUrl}
			<img src={artUrl} alt="" class="absolute inset-0 -z-10 size-full object-cover object-[70%_20%] opacity-70" />
			<div
				class="absolute inset-0 -z-10 bg-linear-to-t from-bg-base-dark from-30% via-bg-base-dark/80 to-bg-base-dark/40 md:bg-linear-to-r md:via-bg-base-dark/75 md:to-bg-base-dark/5"
			></div>
		{/if}
		<div class="flex min-h-44 flex-col justify-end gap-3 p-6 md:p-8 lg:max-w-[40rem]">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-2xl font-bold text-balance md:text-3xl">{scrim.title}</h1>
				<span class="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
					<span aria-hidden="true" class={['size-1.5 rounded-full', DOT[status.state]]}></span>
					{status.text}
				</span>
			</div>
			<ul class="flex flex-wrap gap-2 text-sm">
				{#each meta as item (item)}
					<li class="rounded-full bg-white/10 px-3 py-1 backdrop-blur-sm">{item}</li>
				{/each}
			</ul>
		</div>
	</div>
	{#if current !== undefined}
		<!-- STDF Steps는 목록 구조와 현재 단계를 알리지 않으므로 같은 내용을 보조기기용 목록으로 따로 둔다. -->
		<ol class="sr-only" aria-label="진행 단계">
			{#each STEP_TITLES as title, index (title)}
				<li aria-current={stepState(index) === 'current' ? 'step' : undefined}>{title}, {STEP_STATE_TEXT[stepState(index)]}</li>
			{/each}
		</ol>
		<div aria-hidden="true" class="-mt-4">
			<Steps {steps} {current} radius="full" />
		</div>
	{/if}
</header>
