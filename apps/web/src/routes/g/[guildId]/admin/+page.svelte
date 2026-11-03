<script lang="ts">
	import { Button, Input, Tab, toast } from 'stdf';
	import type { ActionProps } from 'stdf';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import DiscordSettingRow from '#lib/components/admin/DiscordSettingRow.svelte';
	import MemberRiotAccountsDialog from '#lib/components/admin/MemberRiotAccountsDialog.svelte';
	import PageNav from '#lib/components/common/PageNav.svelte';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import type { DiscordChannel, GuildDiscordSettingKey } from '#lib/features/guild/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { nonSubmitButtons } from '#lib/ui/form.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');
	// Riot 계정을 관리 중인 멤버. 저장 후 다시 불러온 목록에서 같은 멤버를 찾아 최신 계정을 보여 준다.
	let accountsFor = $state<string | null>(null);
	let accountsOpen = $state(false);
	const accountsMember = $derived(data.members.find((member) => member.userId === accountsFor) ?? null);
	$effect(() => {
		query = data.q;
	});

	const TABS = [
		{ key: 'members', text: '멤버' },
		{ key: 'discord', text: 'Discord 연동' }
	] as const;
	const active = $derived(TABS.findIndex((tab) => tab.key === data.tab));

	// 탭을 바꾸면 멤버 검색·페이지는 초기화한다.
	function selectTab(index: number) {
		const url = new URL(page.url.href);
		url.search = '';
		const key = TABS[index]!.key;
		if (key !== 'members') url.searchParams.set('tab', key);
		goto(url, { reset: false });
	}

	function navigate(params: { q?: string; page?: number }) {
		const url = new URL(page.url.href);
		if (params.q !== undefined) {
			url.searchParams.delete('page');
			if (params.q.trim()) url.searchParams.set('q', params.q.trim());
			else url.searchParams.delete('q');
		}
		if (params.page !== undefined) {
			if (params.page === 1) url.searchParams.delete('page');
			else url.searchParams.set('page', String(params.page));
		}
		goto(url, { reset: false });
	}

	// 저장 중인 Discord 연동 항목
	let savingKey = $state<GuildDiscordSettingKey | null>(null);

	async function saveDiscord(key: GuildDiscordSettingKey, value: string | null) {
		if (!data.discord || data.discord.settings[key] === value) return;
		savingKey = key;
		const message = await postAction('discord', { key, value: value ?? '' });
		savingKey = null;
		if (message) toast.error(message);
	}

	const NONE = '설정 안 함';
	const CURRENT = { style: 'theme', desc: '현재 설정', disabled: true } as const;
	const channelName = (channel: DiscordChannel) => `${channel.category ? `${channel.category} / ` : ''}#${channel.name}`;

	// 선택지 맨 앞은 항상 '설정 안 함'이다. 현재 값은 표시만 하고 다시 고를 수 없게 한다.
	function choices<T extends { id: string }>(items: T[], current: string | null, toAction: (item: T) => ActionProps, none: Partial<ActionProps> = {}): ActionProps[] {
		return [
			{ ...none, content: NONE, ...(current === null ? CURRENT : {}) },
			...items.map((item) => ({ ...toAction(item), ...(item.id === current ? CURRENT : {}) }))
		];
	}

	const discord = $derived.by(() => {
		if (!data.discord) return null;
		const { roles, channels, settings, actorRoleIds } = data.discord;
		const channelChoices = (current: string | null) =>
			choices(channels, current, (channel) => ({
				content: channelName(channel),
				desc: channel.botCanPost ? undefined : '봇이 글을 쓸 수 없어요',
				disabled: !channel.botCanPost
			}));
		const roleName = roles.find((role) => role.id === settings.operatorRoleId)?.name;
		const channelLabel = (id: string | null) => {
			const channel = channels.find((item) => item.id === id);
			return channel ? `#${channel.name}` : NONE;
		};
		return [
			{
				key: 'operatorRoleId',
				label: '운영자 역할',
				description: '이 역할이나 Discord 서버 관리 권한이 있는 멤버가 서버 관리자예요',
				value: roleName ? `@${roleName}` : NONE,
				// 바꾼 뒤에도 내가 관리자로 남는 선택지만 고를 수 있다.
				actions: choices(
					roles,
					settings.operatorRoleId,
					(role) => {
						const locked = actorRoleIds !== null && !actorRoleIds.includes(role.id);
						return { content: `@${role.name}`, desc: locked ? '내가 가진 역할이 아니에요' : undefined, disabled: locked };
					},
					actorRoleIds !== null ? { desc: 'Discord 서버 관리 권한이 있어야 비울 수 있어요', disabled: true } : {}
				),
				ids: [null, ...roles.map((role) => role.id)]
			},
			{
				key: 'recruitmentChannelId',
				label: '모집 채널',
				description: '내전 모집 글을 올리고 참가 신청을 받아요',
				value: channelLabel(settings.recruitmentChannelId),
				actions: channelChoices(settings.recruitmentChannelId),
				ids: [null, ...channels.map((channel) => channel.id)]
			},
			{
				key: 'entryChannelId',
				label: '엔트리 채널',
				description: '확정된 팀 구성을 올려 밸런스를 확인해요',
				value: channelLabel(settings.entryChannelId),
				actions: channelChoices(settings.entryChannelId),
				ids: [null, ...channels.map((channel) => channel.id)]
			},
			{
				key: 'resultChannelId',
				label: '결과 채널',
				description: '끝난 내전의 결과를 올려요',
				value: channelLabel(settings.resultChannelId),
				actions: channelChoices(settings.resultChannelId),
				ids: [null, ...channels.map((channel) => channel.id)]
			}
		] satisfies { key: GuildDiscordSettingKey; ids: (string | null)[]; [key: string]: unknown }[];
	});
</script>

<svelte:head>
	<title>서버 관리 | {SERVICE_NAME}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<h1 class="text-2xl font-semibold">서버 관리</h1>

	<!-- STDF Tab은 탭 역할을 알리지 않으므로 묶음 이름을 붙이고, 선택한 내용은 영역 제목으로 알린다. -->
	<div role="group" aria-label="관리 항목" class="border-b border-border">
		<Tab labels={TABS.map(({ text }) => ({ text }))} {active} onclickTab={selectTab} />
	</div>

	{#if data.tab === 'discord'}
		<section aria-labelledby="discord" class="flex flex-col gap-3">
			<h2 id="discord" class="sr-only">Discord 연동</h2>
			{#if discord}
				<ul class="divide-y divide-text-primary/5 rounded-(--radius-box) bg-bg-surface dark:divide-text-dark/5 dark:bg-bg-surface-dark">
					{#each discord as item (item.key)}
						<DiscordSettingRow
							label={item.label}
							description={item.description}
							value={item.value}
							actions={item.actions}
							busy={savingKey === item.key}
							onselect={(index) => saveDiscord(item.key, item.ids[index] ?? null)}
						/>
					{/each}
				</ul>
			{:else}
				<SectionState state="empty" message="봇이 아직 이 서버의 역할·채널을 가져오지 못했어요" />
			{/if}
		</section>
	{:else}
		<section aria-labelledby="admins" class="flex flex-col gap-3">
			<div class="flex items-baseline justify-between gap-3">
				<h2 id="admins" class="sr-only">멤버</h2>
				<span class="ml-auto text-sm opacity-60 tabular-nums">관리자 {data.adminCount}명</span>
			</div>
			<form
				role="search"
				aria-label="멤버 검색"
				{@attach nonSubmitButtons}
				class="-mx-2 -my-1"
				onsubmit={(event) => {
					event.preventDefault();
					navigate({ q: query });
				}}
			>
				<Input type="search" placeholder="멤버 이름 검색" bind:value={query} clear onclear={() => navigate({ q: '' })} maxlength={50} />
			</form>

			{#if data.members.length === 0}
				<SectionState state="empty" message={data.q ? `'${data.q}'에 맞는 멤버가 없어요` : '서비스에 연결된 멤버가 없어요'} />
			{:else}
				<!-- 관리자 여부는 Discord 역할·권한으로 정해지므로 표시만 하고, 행의 조작은 Riot 계정 관리 하나다. -->
				<ul class="divide-y divide-text-primary/5 rounded-(--radius-box) bg-bg-surface dark:divide-text-dark/5 dark:bg-bg-surface-dark">
					{#each data.members as member (member.userId)}
						{@const primary = member.riotAccounts[0]}
						<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
							<!-- 좁은 화면에서는 이름을 줄이지 않고 조작을 다음 줄로 내린다. -->
							<span class="flex min-w-48 flex-1 items-center gap-3">
								<PlayerFace name={member.displayName} imageUrl={null} />
								<span class="flex min-w-0 flex-col">
									<span class="flex min-w-0 items-center gap-2">
										<span class="truncate font-medium">{member.displayName}</span>
										{#if member.isAdmin}<StatusTag text="관리자" state="theme" />{/if}
									</span>
									<span class="text-xs opacity-60 sm:truncate">
										{primary ? `${primary.gameName}#${primary.tagLine}${member.riotAccounts.length > 1 ? ` 외 ${member.riotAccounts.length - 1}` : ''}` : 'Riot 계정 없음'}
									</span>
								</span>
							</span>
							<Button fill="lineLight" size="auto" heightOut="0" heightIn="2" injClass="ml-auto px-3 text-sm" onclick={() => ((accountsFor = member.userId), (accountsOpen = true))}>
								Riot 계정<span class="sr-only"> 관리, {member.displayName}</span>
							</Button>
						</li>
					{/each}
				</ul>
			{/if}

			<PageNav total={data.total} pageSize={data.pageSize} current={data.page} onchange={(current) => navigate({ page: current })} />
		</section>
	{/if}
</div>

<MemberRiotAccountsDialog bind:open={accountsOpen} member={accountsMember} />
