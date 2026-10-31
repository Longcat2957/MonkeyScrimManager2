<script lang="ts">
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import MyRegistrationBar from '#lib/components/scrims/MyRegistrationBar.svelte';
	import ParticipantBoard from '#lib/components/scrims/ParticipantBoard.svelte';
	import ScrimOperationsBar from '#lib/components/scrims/ScrimOperationsBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// 종료·중도 종료·취소된 내전은 참가자 목록만 남긴다.
	const showRegistration = $derived(!data.finished && data.me !== null);
	const showOperations = $derived(!data.finished && data.can.manage && data.settings !== null);
</script>

<svelte:head>
	<title>{data.scrim.title} · 내전 요약 | {SERVICE_NAME}</title>
</svelte:head>

<!-- 한 열로 둔다: 내 작업(내 신청·운영)을 한 상자에 모으고, 그 아래 참가자 패널 하나. -->
<div class="flex flex-col gap-6">
	{#if showRegistration || showOperations}
		<div
			class="divide-y divide-text-primary/5 rounded-(--radius-box) border border-border bg-bg-surface dark:divide-text-dark/5 dark:bg-bg-surface-dark"
		>
			{#if showRegistration && data.me}
				<MyRegistrationBar
					registration={data.me.registration}
					accounts={data.me.riotAccounts}
					primaryAccountId={data.me.primaryAccountId}
					canRegister={data.can.register}
					canEdit={data.can.editRegistration}
					blockedReason={data.can.registerBlockedReason}
				/>
			{/if}
			{#if showOperations && data.settings}
				<ScrimOperationsBar nextAction={data.can.nextAction} settings={data.settings} editable={data.editable} />
			{/if}
		</div>
	{/if}

	<ParticipantBoard
		guildId={page.params.guildId!}
		participants={data.participants}
		counts={data.counts}
		manager={data.can.manage}
		canSelect={data.can.select}
	/>
</div>
