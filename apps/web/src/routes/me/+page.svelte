<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import PrivacySettingsList from '#lib/components/me/PrivacySettingsList.svelte';
	import RiotAccountList from '#lib/components/me/RiotAccountList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>내 정보 | {SERVICE_NAME}</title>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-10">
	<header class="flex flex-col gap-6">
		<h1 class="text-2xl font-semibold">내 정보</h1>
		<!-- 프로필 수정은 Discord에서 하므로 동작 없는 식별 정보로만 표시한다. -->
		<div class="flex items-center gap-4">
			{#if data.me.avatarUrl}
				<img src={data.me.avatarUrl} alt="" width="56" height="56" class="size-14 rounded-full object-cover" />
			{:else}
				<span
					class="flex size-14 shrink-0 items-center justify-center rounded-full bg-bg-highlight text-xl font-semibold dark:bg-bg-highlight-dark"
					aria-hidden="true"
				>
					{data.me.displayName.slice(0, 1)}
				</span>
			{/if}
			<div class="flex min-w-0 flex-col">
				<span class="truncate text-lg font-semibold">{data.me.displayName}</span>
				<span class="text-sm opacity-70">Discord 계정으로 로그인했어요</span>
			</div>
		</div>
	</header>

	<RiotAccountList accounts={data.riotAccounts} />
	<PrivacySettingsList privacy={data.privacy} />
</div>
