<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Input, Popup } from 'stdf';
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { FormationTeam } from '#lib/features/scrims/formation.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	let { open = $bindable(false), team }: { open: boolean; team: FormationTeam | null } = $props();

	let name = $state('');
	let error = $state('');
	let pending = $state(false);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			name = team?.name ?? '';
			error = '';
		});
	});

	function close() {
		if (!pending) open = false;
	}

	const submit: SubmitFunction = ({ formData, cancel }) => {
		if (!name.trim()) {
			error = '팀 이름을 입력해 주세요';
			cancel();
			return;
		}
		formData.set('teamId', team?.id ?? '');
		formData.set('name', name.trim());
		pending = true;
		return async ({ result, update }) => {
			pending = false;
			if (result.type === 'success') {
				await update();
				open = false;
			} else if (result.type === 'failure') {
				error = String(result.data?.nameError ?? result.data?.message ?? '저장하지 못했어요');
			} else {
				error = '저장하지 못했어요';
			}
		};
	};
</script>

<div {@attach overlay({ open, label: '팀 이름 변경', onclose: close })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} maskClosable={false} transparent>
		<form
			method="POST"
			action="?/rename"
			novalidate
			use:enhance={submit}
			class="mx-auto flex w-full max-w-sm flex-col gap-5 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
		>
			<h2 class="text-lg font-semibold">팀 이름 변경</h2>
			<Input
				title="팀 이름"
				titlePosition="out"
				placeholder="예: 1팀"
				bind:value={name}
				maxlength={20}
				state={error ? 'error' : 'theme'}
				tip={error}
				required
			/>
			<div class="flex justify-end gap-2">
				<Button type="button" fill="lineLight" size="auto" heightOut="0" injClass="px-4" disabled={pending} onclick={close}>취소</Button>
				<Button type="submit" size="auto" heightOut="0" injClass="px-4" loading={pending ? {} : null}>저장</Button>
			</div>
		</form>
	</Popup>
</div>
