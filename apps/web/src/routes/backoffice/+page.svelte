<script lang="ts">
	import { Button } from 'stdf';
	import { invalidate } from '$app/navigation';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { SERVICE_STATE_LABEL } from '#lib/features/backoffice/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let checking = $state(false);

	const checkedTime = new Intl.DateTimeFormat('ko-KR', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
		timeZone: 'Asia/Seoul'
	});

	async function recheck() {
		checking = true;
		try {
			await invalidate('app:service-status');
		} finally {
			checking = false;
		}
	}
</script>

<svelte:head>
	<title>백오피스 | {SERVICE_NAME}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<h1 class="text-2xl font-semibold">백오피스</h1>

	<section aria-labelledby="service-status" class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 id="service-status" class="text-lg font-semibold">서비스 상태</h2>
			<div class="flex items-center gap-3 text-sm">
				{#await data.status then status}
					<time datetime={status.checkedAt} class="opacity-60">{checkedTime.format(new Date(status.checkedAt))} 확인</time>
				{/await}
				<Button fill="lineLight" size="auto" heightOut="0" heightIn="2" injClass="px-3 text-sm" loading={checking ? {} : null} onclick={recheck}>
					다시 확인
				</Button>
			</div>
		</div>

		{#await data.status}
			<SectionState state="loading" lines={2} />
		{:then status}
			<ul aria-live="polite" class="flex flex-col divide-y divide-text-primary/5 rounded-(--radius-box) border border-border dark:divide-text-dark/5">
				{#each status.services as service (service.key)}
					{@const label = SERVICE_STATE_LABEL[service.state]}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
						<span class="min-w-32 font-medium">{service.name}</span>
						<StatusTag text={label.text} state={label.state} />
						<span class="basis-full text-sm opacity-70 sm:ml-auto sm:basis-auto">
							{[service.issue, service.detail].filter(Boolean).join(' · ')}
						</span>
					</li>
				{/each}
			</ul>
		{:catch}
			<!-- 다시 확인은 제목 옆 버튼 하나로 한다. -->
			<p role="alert" class="rounded-(--radius-box) border border-dashed border-border px-4 py-6 text-center text-sm text-error">상태를 확인하지 못했어요</p>
		{/await}
	</section>
</div>
