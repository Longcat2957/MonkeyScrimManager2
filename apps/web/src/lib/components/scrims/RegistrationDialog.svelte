<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Checkbox, Popup, Radio } from 'stdf';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { LolPosition } from '#lib/features/guild/types.ts';
	import { POSITIONS } from '#lib/features/labels.ts';
	import type { RegistrationAccount } from '#lib/features/scrims/types.ts';
	import { nonSubmitButtons } from '#lib/ui/form.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	type Props = {
		open: boolean;
		// 신청이 없으면 새 신청(register), 있으면 수정(registration)이다.
		editing: boolean;
		accounts: RegistrationAccount[];
		accountId: string;
		positions: LolPosition[];
	};

	let { open = $bindable(false), editing, accounts, accountId: initialAccount, positions: initialPositions }: Props = $props();

	const POSITION_ITEMS = POSITIONS.map((position) => ({ name: position.key, label: position.text }));

	let accountId = $state(untrack(() => initialAccount));
	let positions = $state<string[]>(untrack(() => [...initialPositions]));
	let positionsError = $state('');
	let formError = $state('');
	let pending = $state(false);

	const title = $derived(editing ? '신청 수정' : '참가 신청');
	const accountItems = $derived(accounts.map((item) => ({ name: item.id, label: item.riotId })));

	// 열 때마다 현재 신청 값에서 다시 시작한다.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			accountId = initialAccount;
			positions = [...initialPositions];
			positionsError = '';
			formError = '';
		});
	});

	function close() {
		if (!pending) open = false;
	}

	const submit: SubmitFunction = ({ formData, cancel }) => {
		formError = '';
		positionsError = positions.length ? '' : '희망 포지션을 하나 이상 골라 주세요';
		if (positionsError) {
			cancel();
			return;
		}
		formData.set('riotAccountId', accountId);
		formData.set('positions', positions.join(','));
		pending = true;
		return async ({ result, update }) => {
			pending = false;
			if (result.type === 'success') {
				// 내 신청 줄이 바뀌는 것으로 결과가 보이므로 따로 알리지 않는다.
				await update();
				open = false;
			} else if (result.type === 'failure') {
				positionsError = String(result.data?.positionsError ?? '');
				formError = positionsError ? '' : String(result.data?.message ?? '저장하지 못했어요');
				// 동시 신청으로 마감됐을 수 있으므로 최신 정원을 다시 불러온다.
				if (result.status === 409) await invalidateAll();
			} else {
				formError = '저장하지 못했어요';
			}
		};
	};
</script>

<div {@attach overlay({ open, label: title, onclose: close })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} maskClosable={false} transparent>
		<form
			method="POST"
			action={editing ? '?/registration' : '?/register'}
			novalidate
			use:enhance={submit}
			{@attach nonSubmitButtons}
			class="mx-auto flex w-full max-w-md flex-col gap-5 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
		>
			<h2 class="text-lg font-semibold">{title}</h2>

			{#if accounts.length === 1}
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">Riot 계정</span>
					<span class="break-all">{accounts[0]!.riotId}</span>
				</div>
			{:else}
				<fieldset class="flex flex-col gap-2">
					<legend class="mb-2 text-sm font-medium">Riot 계정</legend>
					<Radio data={accountItems} bind:value={accountId} layout="v" />
				</fieldset>
			{/if}

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm font-medium">희망 포지션</legend>
				<Checkbox data={POSITION_ITEMS} bind:checkeds={positions} layout="h" />
				{#if positionsError}
					<p role="alert" class="text-sm text-error">{positionsError}</p>
				{/if}
			</fieldset>

			{#if formError}
				<p role="alert" class="text-sm text-error">{formError}</p>
			{/if}
			<div class="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
				<Button
					type="button"
					fill="lineLight"
					size={desktop.current ? 'auto' : 'full'}
					heightOut="0"
					injClass="px-4"
					disabled={pending}
					onclick={close}
				>
					취소
				</Button>
				<Button type="submit" size={desktop.current ? 'auto' : 'full'} heightOut="0" injClass="px-4" loading={pending ? {} : null}>
					{editing ? '저장' : '신청하기'}
				</Button>
			</div>
		</form>
	</Popup>
</div>
