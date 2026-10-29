<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Input, Pagination } from 'stdf';
	import { createScrim } from '#lib/data/index.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ChoiceGroup from '#lib/components/ui/ChoiceGroup.svelte';
	import NativeField from '#lib/components/ui/NativeField.svelte';
	import TaskDialog from '#lib/components/ui/TaskDialog.svelte';
	import ScrimRow from '#lib/components/scrim/ScrimRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);

	const STATUS_OPTIONS = [
		{ value: 'all', label: '전체' },
		{ value: 'recruit', label: '모집 중' },
		{ value: 'preparing', label: '편성 중' },
		{ value: 'in_progress', label: '진행 중' },
		{ value: 'completed', label: '종료' }
	] as const;

	const TEAM_OPTIONS = [
		{ value: '2', label: '2팀 · 10인' },
		{ value: '4', label: '4팀 · 20인' }
	] as const;

	const METHOD_OPTIONS = [
		{ value: 'none', label: '미정' },
		{ value: 'manual', label: '엔트리 편성' },
		{ value: 'auction', label: '경매 편성' }
	] as const;

	function go(patch: Record<string, string | number | null>) {
		const url = new URL(String(page.url));
		for (const [key, value] of Object.entries(patch)) {
			const removable =
				value === null || value === '' || value === 'all' || (key === 'page' && Number(value) === 1);
			if (removable) url.searchParams.delete(key);
			else url.searchParams.set(key, String(value));
		}
		goto(url, { reset: false });
	}

	const scrimHref = (scrimId: string) =>
		resolve('/g/[guildId]/scrims/[scrimId]', { guildId: guild.id, scrimId });

	// 모집 생성 초안. 성공하기 전에는 목록을 바꾸지 않는다.
	let createOpen = $state(false);
	let title = $state('');
	let startsAt = $state('');
	let teamCount = $state<'2' | '4'>('2');
	let reserve = $state('0');
	let method = $state<'none' | 'manual' | 'auction'>('none');
	let fearless = $state(true);
	let creating = $state(false);
	let createError = $state<string | null>(null);

	const canCreate = $derived(title.trim().length > 0 && !creating);

	function resetDraft() {
		title = '';
		startsAt = '';
		teamCount = '2';
		reserve = '0';
		method = 'none';
		fearless = true;
		createError = null;
	}

	/** datetime-local 값은 시간대가 없다. 서비스 기준 시간대(KST)로 해석한다. */
	function toKstIso(value: string): string | null {
		if (!value) return null;
		const withSeconds = value.length === 16 ? `${value}:00` : value;
		return `${withSeconds}+09:00`;
	}

	async function submit() {
		if (!canCreate) return;
		creating = true;
		createError = null;
		try {
			await createScrim(guild.id, {
				title: title.trim(),
				expectedStartAt: toKstIso(startsAt),
				teamCount: Number(teamCount),
				reserveCapacity: Math.max(0, Number(reserve) || 0),
				formationMethod: method === 'none' ? null : method,
				isHardFearless: fearless
			});
			// 새 내전이 현재 필터에 가려지지 않도록 전체 목록으로 돌아간 뒤 다시 조회한다.
			if (data.status !== 'all') go({ status: 'all', page: 1 });
			await invalidateAll();
			createOpen = false;
			resetDraft();
		} catch {
			createError = '모집을 만들지 못했어요. 잠시 후 다시 시도해 주세요.';
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('내전', guild.name)}</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4">
	<h1 class="page-title">내전</h1>
	<button type="button" class="btn btn--primary" onclick={() => (createOpen = true)}>모집 생성</button>
</div>

<div class="mt-6 border-t border-line pt-4">
	<ChoiceGroup
		legend="상태"
		name="scrim-status"
		options={STATUS_OPTIONS}
		value={data.status}
		onchange={(value) => go({ status: value, page: 1 })}
	/>
</div>

<div class="region mt-7">
	<span class="lbl">내전 목록</span>
	<span class="count">총 {data.result.total}건</span>
</div>

{#if data.result.total === 0}
	<div class="panel px-5 py-6">
		<p class="text-[13px] text-mut">{data.status === 'all' ? '아직 만들어진 내전이 없습니다.' : '조건에 맞는 내전이 없습니다.'}</p>
	</div>
{:else}
	<div class="panel">
		{#each data.result.items as scrim (scrim.id)}
			<ScrimRow {scrim} href={scrimHref(scrim.id)} />
		{/each}
	</div>

	{#if data.result.total > data.pageSize}
		<div class="mt-6">
			<Pagination
				total={data.result.total}
				pageSize={data.pageSize}
				current={data.page}
				maxShowPage={5}
				onchange={(current) => go({ page: current })}
			/>
		</div>
	{/if}
{/if}

<TaskDialog
	bind:open={createOpen}
	title="모집 생성"
	description="생성하면 서버의 내전 목록 맨 위에 추가됩니다."
	submitLabel="생성"
	cancelLabel="취소"
	pending={creating}
	submitError={createError}
	canSubmit={canCreate}
	onsubmit={submit}
	onclosed={resetDraft}
>
	<div class="space-y-5">
		<Input title="내전 제목" bind:value={title} maxlength={60} py="2" placeholder="예: 30일 밤 내전" />

		<NativeField id="scrim-start" label="예정 시각" hint="비워 두면 미정으로 저장됩니다. 한국 시간(KST) 기준입니다.">
			{#snippet children(describedBy)}
				<input
					id="scrim-start"
					type="datetime-local"
					bind:value={startsAt}
					aria-describedby={describedBy || undefined}
					class="field"
				/>
			{/snippet}
		</NativeField>

		<ChoiceGroup legend="팀 수" name="scrim-team-count" options={TEAM_OPTIONS} bind:value={teamCount} />

		<NativeField id="scrim-reserve" label="추가 신청 정원" hint="실출전 정원과 별도로 대기 인원을 받습니다.">
			{#snippet children(describedBy)}
				<input
					id="scrim-reserve"
					type="number"
					min="0"
					max="20"
					bind:value={reserve}
					aria-describedby={describedBy || undefined}
					class="field tabular w-28 text-end"
				/>
			{/snippet}
		</NativeField>

		<ChoiceGroup legend="편성 방식" name="scrim-method" options={METHOD_OPTIONS} bind:value={method} />

		<label class="flex min-h-11 items-center gap-2.5 text-[13px]">
			<input type="checkbox" bind:checked={fearless} class="size-4" style:accent-color="var(--accent)" />
			하드 피어리스
		</label>
	</div>
</TaskDialog>
