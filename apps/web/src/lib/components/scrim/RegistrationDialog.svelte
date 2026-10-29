<script lang="ts">
	import { Button } from 'stdf';
	import type { Position } from '#lib/data/types.ts';
	import { POSITION_LABEL } from '#lib/components/ui/status.ts';
	import NativeField from '#lib/components/ui/NativeField.svelte';
	import TaskDialog from '#lib/components/ui/TaskDialog.svelte';

	/*
	 * 참가 신청. 신청·변경·철회를 같은 패널에서 처리하고 제목만 바꾼다.
	 * 계정 연결은 /me의 책임이므로 여기서 다시 만들지 않는다.
	 */
	let {
		open = $bindable(false),
		registered = false,
		pending = false,
		error = null,
		onsubmit,
		onclosed
	}: {
		open: boolean;
		registered: boolean;
		pending?: boolean;
		error?: string | null;
		onsubmit: (positions: Position[]) => void;
		onclosed?: () => void;
	} = $props();

	const positions = $derived(Object.keys(POSITION_LABEL) as Position[]);

	let first = $state<Position | ''>('');
	let second = $state<Position | ''>('');

	const canSubmit = $derived(first !== '' && !pending);

	function submit() {
		if (!canSubmit || first === '') return;
		const selected: Position[] = [first];
		// 2순위는 1순위와 다를 때만 보내고, 우선순위가 모호한 중복은 만들지 않는다.
		if (second !== '' && second !== first) selected.push(second);
		onsubmit(selected);
	}

	function reset() {
		first = '';
		second = '';
	}
</script>

<TaskDialog
	bind:open
	title={registered ? '신청 변경' : '참가 신청'}
	description="희망 포지션을 고르면 내전 참가자 명단에 추가됩니다."
	submitLabel="신청"
	cancelLabel="취소"
	{pending}
	submitError={error}
	canSubmit={canSubmit}
	onsubmit={submit}
	onclosed={() => {
		reset();
		onclosed?.();
	}}
>
	<div class="space-y-4">
		<NativeField id="register-first" label="1순위 포지션">
			{#snippet children(describedBy)}
				<select
					id="register-first"
					class="min-h-11 w-full rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
					aria-describedby={describedBy || undefined}
					bind:value={first}
				>
					<option value="">포지션 선택</option>
					{#each positions as position (position)}
						<option value={position}>{POSITION_LABEL[position]}</option>
					{/each}
				</select>
			{/snippet}
		</NativeField>

		<NativeField id="register-second" label="2순위 포지션" hint="선택 사항입니다. 1순위와 다른 포지션을 고릅니다.">
			{#snippet children(describedBy)}
				<select
					id="register-second"
					class="min-h-11 w-full rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
					aria-describedby={describedBy || undefined}
					bind:value={second}
				>
					<option value="">선택 안 함</option>
					{#each positions.filter((position) => position !== first) as position (position)}
						<option value={position}>{POSITION_LABEL[position]}</option>
					{/each}
				</select>
			{/snippet}
		</NativeField>

		<p class="text-caption text-muted">
			정원보다 신청이 많으면 운영자가 선발·대기를 정합니다. 신청 순서로 자동 선발되지 않습니다.
		</p>
	</div>
</TaskDialog>
