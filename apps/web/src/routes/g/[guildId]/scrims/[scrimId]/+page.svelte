<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Steps } from 'stdf';
	import {
		closeRecruitment,
		registerSelf,
		setRegistrationStatus,
		withdrawRegistration,
		type Position
	} from '#lib/data/index.ts';
	import { formatDateTime } from '#lib/format.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import RegistrationDialog from '#lib/components/scrim/RegistrationDialog.svelte';
	import RosterTable from '#lib/components/scrim/RosterTable.svelte';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { FORMATION_LABEL, SCRIM_STATUS } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const detail = $derived(data.detail);
	const viewer = $derived(data.viewer ?? null);

	const title = $derived(pageTitle(detail.title, guild.name));

	// 운영 흐름: 모집 → 편성 → 경기 → 기록. Steps가 현재 위치를 한 곳에서 보여 준다.
	const stepCurrent = $derived(
		detail.status === 'recruit'
			? 1
			: detail.status === 'preparing'
				? 2
				: detail.status === 'ready' || detail.status === 'in_progress'
					? 3
					: 4
	);

	const progress = $derived(
		Math.min(100, Math.round((detail.selectedCount / Math.max(1, detail.playingCapacity)) * 100))
	);

	type Action = 'register' | 'close' | null;

	// 지금 할 수 있는 일 하나와 그 이유 한 문장. 역할·상태에 따라 다르다.
	const now = $derived.by((): { text: string; action: Action } => {
		if (detail.capabilities.canManage && detail.status === 'recruit') {
			const shortage = detail.playingCapacity - detail.selectedCount;
			if (shortage > 0) return { text: `선발이 ${shortage}명 부족합니다.`, action: null };
			return { text: '선발이 끝났습니다. 모집을 마감하면 팀 편성을 시작할 수 있습니다.', action: 'close' };
		}

		if (detail.status === 'cancelled') return { text: '취소된 내전입니다.', action: null };
		if (detail.status === 'ended_early') return { text: '중도 종료된 내전입니다.', action: null };
		if (detail.status === 'completed') return { text: '종료된 내전입니다.', action: null };

		const registration = detail.viewerRegistration;
		if (registration) {
			if (registration.status === 'selected') return { text: '선발되었습니다.', action: null };
			if (registration.status === 'standby') return { text: '대기 중입니다. 선발 인원이 바뀌면 알려 드립니다.', action: null };
			if (registration.status === 'pending') return { text: '신청 완료 · 선발 결과를 기다리는 중입니다.', action: null };
			if (registration.status === 'excluded') return { text: '이 내전에서 제외되었습니다.', action: null };
			return { text: '신청을 철회했습니다.', action: null };
		}

		if (detail.capabilities.canRegister) return { text: '참가 신청을 받고 있습니다.', action: 'register' };
		if (detail.capabilities.registerBlockedReason) {
			return { text: detail.capabilities.registerBlockedReason, action: null };
		}
		if (!viewer) return { text: '로그인하면 참가 신청할 수 있습니다.', action: null };
		return { text: `${SCRIM_STATUS[detail.status].text} 상태입니다.`, action: null };
	});

	// 신청 패널
	let registerOpen = $state(false);
	let registerPending = $state(false);
	let registerError = $state<string | null>(null);

	async function submitRegistration(positions: Position[]) {
		if (!viewer) return;
		registerPending = true;
		registerError = null;
		try {
			const ok = await registerSelf(detail.id, viewer, positions);
			if (!ok) {
				registerError = '신청하지 못했어요. 정원과 모집 상태를 확인해 주세요.';
				return;
			}
			registerOpen = false;
			await invalidateAll();
		} catch {
			registerError = '신청하지 못했어요. 잠시 후 다시 시도해 주세요.';
		} finally {
			registerPending = false;
		}
	}

	// 확인이 필요한 운영 작업
	type PendingAction = { kind: 'withdraw' | 'exclude' | 'close'; participantId?: string };
	let confirm = $state<PendingAction | null>(null);
	let actionPending = $state(false);

	const confirmText = $derived.by(() => {
		if (!confirm) return { title: '', content: '', label: '확인', danger: false };
		if (confirm.kind === 'close') {
			return {
				title: '모집을 마감할까요?',
				content: '마감하면 더 이상 새 신청을 받지 않습니다. 선발·대기 처리는 계속할 수 있습니다.',
				label: '마감',
				danger: false
			};
		}
		if (confirm.kind === 'exclude') {
			return {
				title: '참가자를 제외할까요?',
				content: '제외 이력은 남고, 새 선발 인원에는 포함되지 않습니다.',
				label: '제외',
				danger: true
			};
		}
		return {
			title: '신청을 철회할까요?',
			content: '철회하면 다시 신청할 수 있지만 대기 순서는 사라집니다.',
			label: '철회',
			danger: true
		};
	});

	async function runConfirm() {
		if (!confirm || actionPending) return;
		actionPending = true;
		try {
			if (confirm.kind === 'close') {
				await closeRecruitment(detail.id);
			} else if (confirm.participantId) {
				if (confirm.kind === 'withdraw') await withdrawRegistration(detail.id, confirm.participantId);
				else {
					const ok = await setRegistrationStatus(detail.id, confirm.participantId, 'excluded');
					if (!ok) return;
				}
			}
			confirm = null;
			await invalidateAll();
		} finally {
			actionPending = false;
		}
	}

	async function changeStatus(participantId: string, status: 'selected' | 'standby') {
		if (actionPending) return;
		actionPending = true;
		try {
			await setRegistrationStatus(detail.id, participantId, status);
			await invalidateAll();
		} finally {
			actionPending = false;
		}
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<h1 class="page-title">{detail.title}</h1>

<!-- 대표 요약: 왼쪽 서사 / 오른쪽 스코어보드 -->
<article class="hero mt-5">
	<div class="hero-main">
		<StatusState status={SCRIM_STATUS[detail.status]} />
		<p class="hero-meta mt-2">
			{formatDateTime(detail.expectedStartAt)}
			<span aria-hidden="true"> · </span>
			{detail.teamCount}팀 {detail.playingCapacity}인
			<span aria-hidden="true"> · </span>
			{detail.formationMethod ? FORMATION_LABEL[detail.formationMethod] : '편성 방식 미정'}
		</p>
		{#if detail.isHardFearless}
			<p class="hero-meta">하드 피어리스 적용</p>
		{/if}
		<p class="mt-3 text-[12.5px] text-mut">{now.text}</p>
	</div>
	<div class="hero-score">
		<div class="score"><b>{detail.selectedCount}</b><span>/ {detail.playingCapacity} 선발</span></div>
		<div class="meter"><i style:width={`${progress}%`}></i></div>
		{#if now.action === 'register'}
			<button type="button" class="btn btn--primary w-full" onclick={() => (registerOpen = true)}>
				참가 신청
			</button>
		{:else if now.action === 'close'}
			<button type="button" class="btn btn--primary w-full" onclick={() => (confirm = { kind: 'close' })}>
				모집 마감
			</button>
		{/if}
	</div>
</article>

<!-- 운영 흐름의 현재 위치 -->
<div class="panel mt-3 px-5 py-4">
	<Steps
		steps={[
			{ step: { title: '모집' } },
			{ step: { title: '편성' } },
			{ step: { title: '경기' } },
			{ step: { title: '기록' } }
		]}
		current={stepCurrent}
	/>
</div>

<section class="mt-8" aria-labelledby="roster">
	<div class="region">
		<span class="lbl" id="roster">참가자</span>
		<span class="count tabular">
			신청 {detail.applicantCount} / {detail.appliedCapacity} · 선발 {detail.selectedCount} / {detail.playingCapacity}
		</span>
	</div>

	<RosterTable
		registrations={detail.registrations}
		viewerId={viewer?.id ?? null}
		canManage={detail.capabilities.canManage}
		canWithdraw={detail.status === 'recruit'}
		onstatus={(participantId, status) => {
			if (status === 'excluded') confirm = { kind: 'exclude', participantId };
			else changeStatus(participantId, status);
		}}
		onwithdraw={(participantId) => (confirm = { kind: 'withdraw', participantId })}
	/>
</section>

{#if viewer && now.action === 'register'}
	<RegistrationDialog
		bind:open={registerOpen}
		registered={Boolean(detail.viewerRegistration)}
		pending={registerPending}
		error={registerError}
		onsubmit={submitRegistration}
		onclosed={() => (registerError = null)}
	/>
{/if}

<ConfirmDialog
	bind:open={() => Boolean(confirm), (value) => (confirm = value ? confirm : null)}
	title={confirmText.title}
	content={confirmText.content}
	confirmLabel={confirmText.label}
	danger={confirmText.danger}
	pending={actionPending}
	onconfirm={runConfirm}
/>
