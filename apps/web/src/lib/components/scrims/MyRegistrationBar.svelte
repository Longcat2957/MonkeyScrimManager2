<script lang="ts">
	import { Button, toast } from 'stdf';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import type { LolPosition } from '#lib/features/guild/types.ts';
	import { REGISTRATION_STATUS } from '#lib/features/labels.ts';
	import type { MyRegistration, RegistrationAccount } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import PositionChips from './PositionChips.svelte';
	import RegistrationDialog from './RegistrationDialog.svelte';

	type Props = {
		registration: MyRegistration | null;
		accounts: RegistrationAccount[];
		primaryAccountId: string | null;
		canRegister: boolean;
		canEdit: boolean;
		// 신청할 수 없을 때 보여 줄 한 줄이다. 신청했거나 신청할 수 있으면 null이다.
		blockedReason: string | null;
	};

	let { registration, accounts, primaryAccountId, canRegister, canEdit, blockedReason }: Props = $props();

	let dialogOpen = $state(false);
	let withdrawing = $state(false);

	const status = $derived(registration ? REGISTRATION_STATUS[registration.status] : null);
	const account = $derived(accounts.find((item) => item.id === registration?.riotAccountId));

	async function withdraw() {
		if (!(await confirm('신청을 철회할까요?', '신청 철회'))) return;
		withdrawing = true;
		const message = await postAction('withdraw', {});
		withdrawing = false;
		if (message) toast.error(message);
	}
</script>

<!-- 내 신청은 한 줄로 요약하고, 신청·수정 입력은 팝업에서 받는다. -->
<section aria-labelledby="my-registration" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
	<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
		<h2 id="my-registration" class="text-sm font-semibold">내 신청</h2>
		{#if registration && status}
			{#if status.state}
				<StatusTag text={status.text} state={status.state} />
			{:else}
				<span class="text-xs opacity-60">{status.text}</span>
			{/if}
			<span class="truncate text-sm text-gray-600 dark:text-gray-300">{account?.riotId ?? '연결이 해제된 계정'}</span>
			<PositionChips positions={registration.positions as LolPosition[]} />
		{:else if blockedReason}
			<span class="text-sm opacity-70">{blockedReason}</span>
		{/if}
	</div>

	{#if registration && canEdit}
		<div class="flex shrink-0 gap-2">
			<Button fill="textState" state="error" size="auto" heightOut="0" heightIn="2" injClass="px-3 text-sm" loading={withdrawing ? {} : null} onclick={withdraw}>
				철회
			</Button>
			<Button fill="lineLight" size="auto" heightOut="0" heightIn="2" injClass="px-3 text-sm" disabled={withdrawing} onclick={() => (dialogOpen = true)}>
				수정
			</Button>
		</div>
	{:else if canRegister}
		<span class="shrink-0">
			<Button size="auto" heightOut="0" heightIn="2" injClass="px-4 text-sm" onclick={() => (dialogOpen = true)}>신청하기</Button>
		</span>
	{/if}
</section>

{#if canRegister || (registration && canEdit)}
	<RegistrationDialog
		bind:open={dialogOpen}
		editing={Boolean(registration)}
		{accounts}
		accountId={registration?.riotAccountId ?? primaryAccountId ?? accounts[0]?.id ?? ''}
		positions={(registration?.positions as LolPosition[] | undefined) ?? []}
	/>
{/if}
