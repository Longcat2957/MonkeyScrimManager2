<script lang="ts">
	import { Button, Popup, Radio } from 'stdf';
	import type { FormationMethod } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	// 모집을 마감하면서 편성 방식을 고른다. 모집 중에는 방식을 정하지 않고, 선발 인원이 다 찬 뒤 여기서 한 번 정한다.
	let { open = $bindable(false) }: { open: boolean } = $props();

	const METHODS: { name: FormationMethod; label: string }[] = [
		{ name: 'manual', label: '수동 편성' },
		{ name: 'auction', label: '경매' }
	];

	let method = $state<FormationMethod | null>(null);
	let error = $state('');
	let pending = $state(false);

	// 열 때마다 고르지 않은 상태에서 시작한다.
	$effect(() => {
		if (!open) return;
		method = null;
		error = '';
	});

	function close() {
		if (!pending) open = false;
	}

	async function submit() {
		if (!method) {
			error = '편성 방식을 골라 주세요';
			return;
		}
		pending = true;
		const message = await postAction('advance', { key: 'close', formationMethod: method });
		pending = false;
		if (message) error = message;
		else open = false;
	}
</script>

<div {@attach overlay({ open, label: '모집 마감', onclose: close })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} transparent>
		<div class="mx-auto flex w-full max-w-md flex-col gap-5 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark">
			<h2 class="text-lg font-semibold">모집 마감</h2>
			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm font-medium">편성 방식</legend>
				<Radio data={METHODS} value={method ?? ''} layout="h" onchange={(value) => ((method = value as FormationMethod), (error = ''))} />
			</fieldset>
			{#if error}
				<p role="alert" class="text-sm text-error">{error}</p>
			{/if}
			<div class="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
				<Button type="button" fill="lineLight" size={desktop.current ? 'auto' : 'full'} heightOut="0" injClass="px-4" disabled={pending} onclick={close}>취소</Button>
				<Button type="button" size={desktop.current ? 'auto' : 'full'} heightOut="0" injClass="px-4" loading={pending ? {} : null} onclick={submit}>마감</Button>
			</div>
		</div>
	</Popup>
</div>
