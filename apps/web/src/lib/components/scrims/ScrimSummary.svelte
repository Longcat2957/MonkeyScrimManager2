<script lang="ts">
	import { Steps } from 'stdf';
	import type { StepsItemProps } from 'stdf';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { formatSchedule, formationMethodLabel, SCRIM_STATUS } from '#lib/features/labels.ts';
	import type { ScrimContext, ScrimStatus } from '#lib/features/scrims/types.ts';

	let { scrim }: { scrim: ScrimContext } = $props();

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
	const current = $derived(STEP_INDEX[scrim.status]);
	const steps: StepsItemProps[] = STEP_TITLES.map((title) => ({ step: { title } }));
	const meta = $derived(
		[
			formatSchedule(scrim.scheduledAt),
			`${scrim.teamCount}팀`,
			formationMethodLabel(scrim.formationMethod),
			scrim.hardFearless ? '하드 피어리스' : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<header class="mb-8 flex flex-col gap-4 border-b border-border pb-6">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold">{scrim.title}</h1>
		<StatusTag text={status.text} state={status.state} />
	</div>
	<p class="text-sm opacity-70">{meta}</p>
	{#if current !== undefined}
		<div class="max-w-xl">
			<Steps {steps} {current} />
		</div>
	{/if}
</header>
