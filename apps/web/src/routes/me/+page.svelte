<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Skeleton } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import ParticipantIdentity from '#lib/components/common/ParticipantIdentity.svelte';
	import RiotAccountConnections from '#lib/components/me/RiotAccountConnections.svelte';
	import PrivacySettingsForm from '#lib/components/me/PrivacySettingsForm.svelte';
	import { createMeMockActions } from '#lib/mocks/me.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let loading = $state(false);
	let loadError = $state(untrack(() => data.scenario === 'load-error'));
	const actions = $derived(createMeMockActions(data.scenario));

	async function retry() {
		loading = true;
		await new Promise((resolve) => setTimeout(resolve, 350));
		loadError = false;
		loading = false;
	}

	$effect(() => {
		loadError = data.scenario === 'load-error';
	});
</script>

<svelte:head>
	<title>내 정보 | {SERVICE_NAME}</title>
	<meta name="description" content="연결한 Riot 계정과 내전 프로필 공개 범위를 관리합니다." />
</svelte:head>

<div class="mx-auto w-full max-w-(--app-settings-width) space-y-10">
	<h1 class="text-2xl font-semibold tracking-tight">내 정보</h1>

	{#if !data.me}
		<p class="text-sm leading-7 opacity-70">로그인 후 계정 연결과 공개 범위를 관리할 수 있습니다.</p>
	{:else if loading}
		<div class="space-y-8" role="status" aria-label="내 정보를 불러오는 중">
			<div aria-hidden="true" class="space-y-4">
				<Skeleton type="div" width="48" height="12" />
				<Skeleton type="div" width="full" height="24" />
				<Skeleton type="div" width="full" height="32" />
			</div>
		</div>
	{:else if loadError}
		<div class="space-y-4">
			<p role="alert" class="text-sm leading-7">내 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
			<Button fill="line" size="md" heightOut="0" injClass="app-button" onclick={retry}>다시 불러오기</Button>
		</div>
	{:else}
		{#key data.scenario}
			<ParticipantIdentity {...data.me.profile} />
			<RiotAccountConnections
				accounts={data.me.accounts}
				onlookup={actions.lookupAccount}
				onlink={actions.linkAccount}
				onunlink={actions.unlinkAccount}
			/>
			<PrivacySettingsForm value={data.me.privacy} onsave={actions.savePrivacy} />
		{/key}
	{/if}
</div>
