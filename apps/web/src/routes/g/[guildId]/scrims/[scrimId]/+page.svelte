<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'stdf';
	import {
		closeRecruitment,
		registerSelf,
		setRegistrationStatus,
		withdrawRegistration,
		type Position
	} from '#lib/data/index.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import NowLine from '#lib/components/ui/NowLine.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import RegistrationDialog from '#lib/components/scrim/RegistrationDialog.svelte';
	import RosterTable from '#lib/components/scrim/RosterTable.svelte';
	import ScrimContextBar from '#lib/components/scrim/ScrimContextBar.svelte';
	import { SCRIM_STATUS } from '#lib/components/ui/status.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const scrim = $derived(data.scrim);
	const detail = $derived(data.detail);
	const viewer = $derived(data.viewer ?? null);

	const title = $derived(pageTitle(scrim.title, guild.name));

	type Action = 'register' | 'close' | null;

	// "지금 줄": 역할과 상태에 따라 문장 하나와 행동 하나만 정한다.
	const now = $derived.by((): { tone: 'info' | 'warning' | 'success' | 'danger'; text: string; action: Action } => {
		if (detail.capabilities.canManage && detail.status === 'recruit') {
			const shortage = detail.playingCapacity - detail.selectedCount;
			if (shortage > 0) {
				return {
					tone: 'info',
					text: `선발이 ${shortage}명 부족합니다. 참가자를 선발하면 팀 편성을 시작할 수 있습니다.`,
					action: null
				};
			}
			return {
				tone: 'success',
				text: '선발이 끝났습니다. 모집을 마감하면 팀 편성을 시작할 수 있습니다.',
				action: 'close'
			};
		}

		if (detail.capabilities.canManage) {
			if (detail.status === 'cancelled') return { tone: 'danger', text: '취소된 내전입니다.', action: null };
			if (detail.status === 'ended_early') return { tone: 'warning', text: '중도 종료된 내전입니다.', action: null };
			if (detail.status === 'completed') return { tone: 'success', text: '종료된 내전입니다.', action: null };
			if (detail.status === 'in_progress') return { tone: 'info', text: '경기가 진행 중입니다.', action: null };
			return { tone: 'info', text: '편성 중입니다.', action: null };
		}

		const registration = detail.viewerRegistration;
		if (registration) {
			if (registration.status === 'selected') return { tone: 'success', text: '선발되었습니다.', action: null };
			if (registration.status === 'standby') return { tone: 'warning', text: '대기 중입니다. 선발 인원이 바뀌면 알려 드립니다.', action: null };
			if (registration.status === 'pending') return { tone: 'info', text: '신청 완료 · 선발 결과를 기다리는 중입니다.', action: null };
			if (registration.status === 'excluded') return { tone: 'danger', text: '이 내전에서 제외되었습니다.', action: null };
			return { tone: 'warning', text: '신청을 철회했습니다.', action: null };
		}

		if (detail.capabilities.canRegister) return { tone: 'info', text: '참가 신청을 받고 있습니다.', action: 'register' };
		if (detail.capabilities.registerBlockedReason) {
			return { tone: 'warning', text: detail.capabilities.registerBlockedReason, action: null };
		}
		if (!viewer) return { tone: 'info', text: '로그인하면 참가 신청할 수 있습니다.', action: null };
		return { tone: 'info', text: `${SCRIM_STATUS[detail.status].text} 상태입니다.`, action: null };
	});

	const rosterSummary = $derived(
		`신청 ${detail.applicantCount} / ${detail.appliedCapacity} · 선발 ${detail.selectedCount} / ${detail.playingCapacity}`
	);

	// 신청 패널 상태
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

<!-- 모집 마감은 "지금 줄"이 조건을 만족할 때 한 곳에서만 제공한다. -->
<PageHeader title={scrim.title} />

<div class="space-y-3">
	<ScrimContextBar scrim={detail} />

	<NowLine tone={now.tone} statements={now.text}>
		{#snippet action()}
			{#if now.action === 'register'}
				<Button size="auto" injClass="px-4" fill="base" state="theme" onclick={() => (registerOpen = true)}>
					참가 신청
				</Button>
			{:else if now.action === 'close'}
				<Button size="auto" injClass="px-4" fill="base" state="theme" onclick={() => (confirm = { kind: 'close' })}>
					모집 마감
				</Button>
			{/if}
		{/snippet}
	</NowLine>
</div>

<section class="mt-10" aria-labelledby="roster">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 id="roster" class="text-title-l">참가자</h2>
		<p class="tabular text-caption text-muted">{rosterSummary}</p>
	</div>

	<div class="mt-3 border-t border-line pt-2">
		{#if detail.registrations.length === 0}
			<p class="py-4 text-body-s text-muted">아직 신청한 참가자가 없습니다.</p>
		{:else}
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
		{/if}
	</div>
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
