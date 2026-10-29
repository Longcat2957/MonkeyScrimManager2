<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { ActionSheet, type ActionProps } from 'stdf';
	import { saveGuildSettings, setMemberRole } from '#lib/data/index.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const admin = $derived(data.admin);

	// 게시 설정 초안
	let recruitChannel = $state(untrack(() => admin.settings.recruitChannel ?? ''));
	let resultChannel = $state(untrack(() => admin.settings.resultChannel ?? ''));
	let saving = $state(false);
	let saved = $state(false);
	let saveError = $state<string | null>(null);

	const dirty = $derived(
		recruitChannel !== (admin.settings.recruitChannel ?? '') ||
			resultChannel !== (admin.settings.resultChannel ?? '')
	);

	const channelOptions = ['#내전-모집', '#결과-알림', '#운영-로그'];

	async function submitSettings(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		saveError = null;
		saved = false;
		try {
			await saveGuildSettings(guild.id, {
				recruitChannel: recruitChannel || null,
				resultChannel: resultChannel || null
			});
			await invalidateAll();
			saved = true;
		} catch {
			saveError = '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
		} finally {
			saving = false;
		}
	}

	function revertSettings() {
		recruitChannel = admin.settings.recruitChannel ?? '';
		resultChannel = admin.settings.resultChannel ?? '';
		saved = false;
	}

	// 멤버: 행을 누르면 처리 시트가 열린다. 별도 버튼을 나열하지 않는다.
	let memberIndex = $state<number | null>(null);
	let sheetOpen = $state(false);

	const member = $derived(memberIndex === null ? null : admin.members[memberIndex]);

	const actions = $derived.by((): ActionProps[] => {
		if (!member) return [];
		return [
			{ content: '전적 보기' },
			{
				content: member.role === 'admin' ? '관리자 해제' : '관리자 지정',
				style: member.role === 'admin' ? 'error' : 'normal'
			}
		];
	});

	function openMember(index: number) {
		memberIndex = index;
		sheetOpen = true;
	}

	async function onAction(index: number) {
		if (memberIndex === null || !member) return;
		if (index === 0) {
			const userId = member.player.userId;
			sheetOpen = false;
			if (userId) goto(resolve('/g/[guildId]/players/[playerId]', { guildId: guild.id, playerId: userId }));
			return;
		}
		// 권한 변경은 확인을 거친다.
		roleTarget = {
			userId: member.player.userId ?? '',
			displayName: member.player.displayName,
			nextRole: member.role === 'admin' ? 'member' : 'admin'
		};
		sheetOpen = false;
	}

	type RoleTarget = { userId: string; displayName: string; nextRole: 'member' | 'admin' };
	let roleTarget = $state<RoleTarget | null>(null);
	let rolePending = $state(false);

	async function runRoleChange() {
		if (!roleTarget || rolePending) return;
		rolePending = true;
		try {
			await setMemberRole(guild.id, roleTarget.userId, roleTarget.nextRole);
			roleTarget = null;
			await invalidateAll();
		} finally {
			rolePending = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('관리', guild.name)}</title>
</svelte:head>

<h1 class="page-title">관리</h1>

<div class="measure mt-8 space-y-10">
	{#if admin.capabilities.canEdit}
		<section aria-labelledby="channels">
			<div class="region">
				<span class="lbl" id="channels">게시 설정</span>
			</div>

			<form class="panel grid gap-4 p-5" onsubmit={submitSettings}>
				<div class="grid gap-1.5">
					<label for="recruit-channel" class="text-[12px] font-semibold">모집 채널</label>
					<select id="recruit-channel" class="field" bind:value={recruitChannel}>
						<option value="">미설정</option>
						{#each channelOptions as channel (channel)}<option value={channel}>{channel}</option>{/each}
					</select>
					<p class="text-[11px] text-faint">새 모집을 안내할 Discord 채널입니다. 미설정이면 게시하지 않습니다.</p>
				</div>

				<div class="grid gap-1.5">
					<label for="result-channel" class="text-[12px] font-semibold">결과 채널</label>
					<select id="result-channel" class="field" bind:value={resultChannel}>
						<option value="">미설정</option>
						{#each channelOptions as channel (channel)}<option value={channel}>{channel}</option>{/each}
					</select>
					<p class="text-[11px] text-faint">경기 결과가 기록될 때 알릴 Discord 채널입니다.</p>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<button type="submit" class="btn btn--primary" disabled={!dirty || saving}>저장</button>
					<button type="button" class="btn" disabled={!dirty || saving} onclick={revertSettings}>변경 취소</button>
					{#if saved && !dirty}<span class="text-[11.5px] text-accent">저장되었습니다.</span>{/if}
					{#if saveError}<span class="text-[11.5px] text-rose">{saveError}</span>{/if}
				</div>
			</form>
		</section>
	{/if}

	<section aria-labelledby="members">
		<div class="region">
			<span class="lbl" id="members">멤버·권한</span>
			<span class="count">{admin.members.length}명</span>
		</div>

		<div class="panel">
			{#each admin.members as item, index (item.player.userId ?? `${item.player.displayName}-${index}`)}
				<button type="button" class="row w-full text-left" onclick={() => openMember(index)}>
					<span class="min-w-0">
						<span class="row-title block">{item.player.displayName}</span>
						<span class="row-meta block">{item.player.riotId ?? 'Riot 계정 미연결'}</span>
					</span>
					<span class="row-meta text-right">{item.role === 'admin' ? '관리자' : '일반'}</span>
					<span class="row-side text-faint" aria-hidden="true">→</span>
				</button>
			{/each}
		</div>
	</section>
</div>

<ActionSheet
	bind:visible={sheetOpen}
	title={member?.player.displayName ?? ''}
	{actions}
	showCancel
	cancelText="닫기"
	onclickAction={onAction}
	onclose={() => (memberIndex = null)}
/>

<ConfirmDialog
	bind:open={() => roleTarget !== null, (value) => (roleTarget = value ? roleTarget : null)}
	title={roleTarget?.nextRole === 'admin' ? '관리자로 지정할까요?' : '관리자 권한을 해제할까요?'}
	content={roleTarget?.nextRole === 'admin'
		? `${roleTarget?.displayName} 님이 서버 설정과 멤버 권한을 관리할 수 있게 됩니다.`
		: `${roleTarget?.displayName} 님의 관리자 권한을 해제합니다. 서비스 전체 운영자 권한과는 다릅니다.`}
	confirmLabel={roleTarget?.nextRole === 'admin' ? '지정' : '해제'}
	danger={roleTarget?.nextRole === 'member'}
	pending={rolePending}
	onconfirm={runRoleChange}
/>
