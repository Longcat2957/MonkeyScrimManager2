<script lang="ts">
	import { ActionSheet, type ActionProps } from 'stdf';
	import type { Registration } from '#lib/data/types.ts';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { POSITION_LABEL, REGISTRATION_STATUS } from '#lib/components/ui/status.ts';

	/*
	 * 참가자 명단.
	 * 본인 행을 맨 위에 고정하고, 운영자는 행 하나를 골라 ActionSheet에서 처리한다.
	 * 표가 아니라 큰 터치 행으로 두어 모바일에서도 같은 조작을 쓴다.
	 */
	let {
		registrations,
		viewerId,
		canManage,
		canWithdraw,
		onstatus,
		onwithdraw
	}: {
		registrations: Registration[];
		viewerId: string | null;
		canManage: boolean;
		canWithdraw: boolean;
		onstatus: (participantId: string, status: 'selected' | 'standby' | 'excluded') => void;
		onwithdraw: (participantId: string) => void;
	} = $props();

	// 본인 → 선발 → 대기 → 신청 → 철회/제외. 같은 상태는 신청 시각 순이다.
	const order = { selected: 0, standby: 1, pending: 2, withdrawn: 3, excluded: 4 } as const;
	const sorted = $derived(
		[...registrations].sort((a, b) => {
			const aSelf = a.player.userId && a.player.userId === viewerId ? 0 : 1;
			const bSelf = b.player.userId && b.player.userId === viewerId ? 0 : 1;
			return aSelf - bSelf || order[a.status] - order[b.status] || a.joinedAt.localeCompare(b.joinedAt);
		})
	);

	let target = $state<Registration | null>(null);
	let sheetOpen = $state(false);
	let pending = $state(false);

	function openSheet(registration: Registration) {
		target = registration;
		sheetOpen = true;
	}

	const actions = $derived.by((): ActionProps[] => {
		if (!target) return [];
		return [
			{ content: '선발', disabled: target.status === 'selected' },
			{ content: '대기', disabled: target.status === 'standby' },
			{ content: '제외', style: 'error', disabled: target.status === 'excluded' }
		];
	});

	async function onAction(index: number) {
		if (!target || pending) return;
		const next = (['selected', 'standby', 'excluded'] as const)[index];
		if (!next) return;
		pending = true;
		try {
			await onstatus(target.participantId, next);
			sheetOpen = false;
		} finally {
			pending = false;
		}
	}

	const positionText = (registration: Registration) =>
		registration.positions.length > 0
			? registration.positions.map((position) => POSITION_LABEL[position]).join(' · ')
			: '포지션 미지정';
</script>

{#if sorted.length === 0}
	<p class="py-5 text-[13px] text-mut">아직 신청한 참가자가 없습니다.</p>
{:else}
	<ul class="panel">
		{#each sorted as registration (registration.participantId)}
			{@const self = Boolean(viewerId && registration.player.userId === viewerId)}
			<li
				class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 first:border-t-0 {self
					? 'bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]'
					: ''}"
			>
				<div class="min-w-0 flex-1">
					<p class="truncate text-[14px] font-bold">
						{registration.player.displayName}
						{#if self}<span class="ml-1.5 text-[10.5px] font-semibold text-accent">나</span>{/if}
					</p>
					<p class="truncate text-[11.5px] text-faint">
						{registration.player.riotId ?? 'Riot 계정 미연결'} · {positionText(registration)}
					</p>
				</div>

				<StatusState status={REGISTRATION_STATUS[registration.status]} />

				{#if canManage && registration.status !== 'withdrawn'}
					<button type="button" class="btn btn--text min-h-9 px-2" onclick={() => openSheet(registration)}>
						관리
					</button>
				{:else if canWithdraw && self && registration.status !== 'withdrawn'}
					<button
						type="button"
						class="btn btn--text min-h-9 px-2 text-rose"
						onclick={() => onwithdraw(registration.participantId)}
					>
						철회
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<ActionSheet
	bind:visible={sheetOpen}
	title={target ? `${target.player.displayName} 처리` : ''}
	{actions}
	showCancel
	cancelText="닫기"
	onclickAction={onAction}
	onclose={() => (target = null)}
/>
