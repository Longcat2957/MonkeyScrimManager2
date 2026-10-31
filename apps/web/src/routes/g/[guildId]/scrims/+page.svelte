<script lang="ts">
	import { Button, CellGroup, Loading, Pagination, Tab } from 'stdf';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import ScrimListRow from '#lib/components/scrims/ScrimListRow.svelte';
	import ScrimSettingsDialog from '#lib/components/scrims/ScrimSettingsDialog.svelte';
	import { editableFields, TEAM_COUNT } from '#lib/features/scrims/settings.ts';
	import type { ScrimSettings, ScrimStatusFilter } from '#lib/features/scrims/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTERS: { key: ScrimStatusFilter; text: string }[] = [
		{ key: 'all', text: '전체' },
		{ key: 'recruit', text: '모집 중' },
		{ key: 'active', text: '진행 중' },
		{ key: 'done', text: '종료' }
	];
	const NEW_SCRIM: ScrimSettings = {
		title: '',
		scheduledAt: null,
		teamCount: TEAM_COUNT.min,
		reserveCapacity: 2,
		formationMethod: null,
		hardFearless: false
	};
	// 새 모집은 모집 단계이므로 모든 설정을 입력받는다.
	const CREATE_FIELDS = editableFields('recruit');

	const guildId = $derived(page.params.guildId!);
	const active = $derived(FILTERS.findIndex((filter) => filter.key === data.statusFilter));
	const labels = $derived(FILTERS.map((filter) => ({ text: `${filter.text} ${data.counts[filter.key]}` })));
	// 같은 목록의 필터·쪽만 바뀌는 동안에는 이전 결과를 흐리게 둔다.
	const changing = $derived(navigating.to?.route.id === page.route.id);

	let creating = $state(false);

	function navigate(params: { status?: ScrimStatusFilter; page?: number }) {
		const url = new URL(page.url.href);
		if (params.status !== undefined) {
			url.searchParams.delete('page');
			if (params.status === 'all') url.searchParams.delete('status');
			else url.searchParams.set('status', params.status);
		}
		if (params.page !== undefined) {
			if (params.page === 1) url.searchParams.delete('page');
			else url.searchParams.set('page', String(params.page));
		}
		goto(url, { reset: false });
	}

	async function created(result: Record<string, unknown> | undefined) {
		const scrimId = String(result?.id ?? '');
		if (scrimId) await goto(resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }));
	}
</script>

<svelte:head>
	<title>내전 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex items-center justify-between gap-4">
		<h1 class="text-2xl font-semibold">내전</h1>
		{#if data.can.createScrim}
			<span class="shrink-0">
				<Button fill="base" size="auto" heightOut="0" injClass="px-4" onclick={() => (creating = true)}>모집 만들기</Button>
			</span>
		{/if}
	</div>

	{#if data.counts.all === 0}
		<SectionState state="empty" message="아직 내전이 없어요" />
	{:else}
		<section aria-labelledby="scrim-list" class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<h2 id="scrim-list" class="sr-only">{FILTERS[active]?.text} 내전</h2>
				<!-- STDF Tab은 탭 역할을 알리지 않으므로 묶음 이름을 붙이고, 선택한 내용은 숨긴 영역 제목으로 알린다. -->
				<div role="group" aria-label="상태 필터" class="min-w-0 flex-1 border-b border-border">
					<Tab {labels} {active} onclickTab={(index) => navigate({ status: FILTERS[index]!.key })} />
				</div>
				{#if changing}
					<Loading type="1_0" height="6" width="6" />
				{/if}
			</div>

			{#if data.scrims.length === 0}
				<SectionState state="empty" message="조건에 맞는 내전이 없어요" />
			{:else}
				<div class={['transition-opacity', changing && 'opacity-50']}>
					<CellGroup my="0" mx="0" shadow="none">
						<ul>
							{#each data.scrims as scrim, index (scrim.id)}
								<li>
									<ScrimListRow
										{scrim}
										href={resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: scrim.id })}
										line={index < data.scrims.length - 1}
									/>
								</li>
							{/each}
						</ul>
					</CellGroup>
				</div>
			{/if}

			{#if data.total > data.pageSize}
				<nav aria-label="쪽 이동" class="flex justify-center pt-2">
					<Pagination
						total={data.total}
						pageSize={data.pageSize}
						current={data.page}
						onchange={(current) => navigate({ page: current })}
					/>
				</nav>
			{/if}
		</section>
	{/if}
</div>

{#if data.can.createScrim}
	<ScrimSettingsDialog
		bind:open={creating}
		title="모집 만들기"
		submitText="만들기"
		action="create"
		initial={NEW_SCRIM}
		editable={CREATE_FIELDS}
		onsaved={created}
	/>
{/if}
