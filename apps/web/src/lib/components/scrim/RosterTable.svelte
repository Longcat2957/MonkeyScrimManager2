<script lang="ts">
	import { Button } from 'stdf';
	import type { Registration } from '#lib/data/types.ts';
	import DataTable from '#lib/components/ui/DataTable.svelte';
	import StatusTag from '#lib/components/ui/StatusTag.svelte';
	import { POSITION_LABEL, REGISTRATION_STATUS } from '#lib/components/ui/status.ts';

	/*
	 * 참가자 명단.
	 * 본인 행을 맨 위에 고정하고, 운영자는 행 하나만 펼쳐 처리한다(여러 편집 영역을 동시에 열지 않는다).
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

	let opened: string | null = $state(null);

	function toggle(participantId: string) {
		opened = opened === participantId ? null : participantId;
	}

	const columns = $derived([
		{ label: '참가자' },
		{ label: '희망 포지션', hideInStack: true },
		{ label: '상태' },
		{ label: canManage || canWithdraw ? '관리' : '', align: 'end' as const }
	]);
</script>

{#snippet rowCell(registration: Registration)}
	<th scope="row" class="flex min-w-0 items-center gap-2 py-2">
		<span class="min-w-0">
			<span class="block truncate font-semibold">{registration.player.displayName}</span>
			<span class="block truncate text-caption text-muted">{registration.player.riotId ?? 'Riot 계정 미연결'}</span>
		</span>
		{#if viewerId && registration.player.userId === viewerId}
			<span class="shrink-0 rounded-full border border-line px-1.5 text-caption text-muted">나</span>
		{/if}
	</th>
	<td data-label="희망 포지션" class="hide-in-stack text-muted">
		{registration.positions.length > 0
			? registration.positions.map((position) => POSITION_LABEL[position]).join(' · ')
			: '미지정'}
	</td>
	<td data-label="상태"><StatusTag status={REGISTRATION_STATUS[registration.status]} /></td>
	<td data-label="관리" class="text-end">
		{#if canManage && registration.status !== 'withdrawn'}
			<Button size="auto" injClass="px-3" fill="line" onclick={() => toggle(registration.participantId)}>
				{opened === registration.participantId ? '닫기' : '관리'}
			</Button>
		{:else if canWithdraw && registration.player.userId === viewerId && registration.status !== 'withdrawn'}
			<Button size="auto" injClass="px-3" fill="line" state="error" onclick={() => onwithdraw(registration.participantId)}>
				신청 철회
			</Button>
		{/if}
	</td>
{/snippet}

<DataTable caption="참가자 명단" {columns} items={sorted}>
	{#snippet row(registration)}
		<tr aria-current={viewerId && registration.player.userId === viewerId ? 'true' : undefined}>
			{@render rowCell(registration)}
		</tr>
		{#if canManage && opened === registration.participantId}
			<tr class="bg-surface-raised">
				<td colspan={columns.length} data-label="처리">
					<div class="flex flex-wrap items-center gap-2 py-1">
						<span class="text-caption text-muted">선발 처리</span>
						<Button size="auto" injClass="px-3" fill="line" disabled={registration.status === 'selected'} onclick={() => onstatus(registration.participantId, 'selected')}>선발</Button>
						<Button size="auto" injClass="px-3" fill="line" disabled={registration.status === 'standby'} onclick={() => onstatus(registration.participantId, 'standby')}>대기</Button>
						<Button size="auto" injClass="px-3" fill="line" state="error" disabled={registration.status === 'excluded'} onclick={() => onstatus(registration.participantId, 'excluded')}>제외</Button>
					</div>
				</td>
			</tr>
		{/if}
	{/snippet}
</DataTable>
