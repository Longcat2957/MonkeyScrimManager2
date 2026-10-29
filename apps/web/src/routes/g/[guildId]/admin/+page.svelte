<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button } from 'stdf';
	import { saveGuildSettings, setMemberRole } from '#lib/data/index.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import DataTable from '#lib/components/ui/DataTable.svelte';
	import NativeField from '#lib/components/ui/NativeField.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const guild = $derived(data.guild);
	const admin = $derived(data.admin);

	// 게시 설정 초안. 저장 전에는 현재 저장값과 구분해 표시한다.
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

	// 권한 변경
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

	const columns = [
		{ label: '참가자' },
		{ label: '권한', hideInStack: true },
		{ label: '연결일', hideInStack: true },
		{ label: '관리', align: 'end' as const }
	];
</script>

<svelte:head>
	<title>{pageTitle('관리', guild.name)}</title>
</svelte:head>

<PageHeader title="관리" description="서버 설정과 멤버 권한을 관리합니다." />

<div class="space-y-12">
	{#if admin.capabilities.canEdit}
		<section aria-labelledby="channels">
			<h2 id="channels" class="border-t border-line pt-4 text-title-l">게시 설정</h2>

			<form class="mt-3 grid max-w-xl gap-4" onsubmit={submitSettings}>
				<NativeField id="recruit-channel" label="모집 채널" hint="새 모집을 안내할 Discord 채널입니다. 미설정이면 게시하지 않습니다.">
					{#snippet children(describedBy)}
						<select
							id="recruit-channel"
							bind:value={recruitChannel}
							aria-describedby={describedBy || undefined}
							class="min-h-11 w-full rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
						>
							<option value="">미설정</option>
							{#each channelOptions as channel (channel)}
								<option value={channel}>{channel}</option>
							{/each}
						</select>
					{/snippet}
				</NativeField>

				<NativeField id="result-channel" label="결과 채널" hint="경기 결과가 기록될 때 알릴 Discord 채널입니다.">
					{#snippet children(describedBy)}
						<select
							id="result-channel"
							bind:value={resultChannel}
							aria-describedby={describedBy || undefined}
							class="min-h-11 w-full rounded-sm border border-line bg-surface-sunken px-3 text-body-s"
						>
							<option value="">미설정</option>
							{#each channelOptions as channel (channel)}
								<option value={channel}>{channel}</option>
							{/each}
						</select>
					{/snippet}
				</NativeField>

				<div class="flex flex-wrap items-center gap-3">
					<Button
						type="submit"
						size="auto"
						injClass="px-4"
						fill="base"
						state="theme"
						disabled={!dirty}
						loading={saving ? { height: '4', width: '4' } : null}
					>
						저장
					</Button>
					<Button size="auto" injClass="px-4" fill="line" disabled={!dirty || saving} onclick={revertSettings}>
						변경 취소
					</Button>
					{#if saved && !dirty}<span class="text-caption" style:color="var(--success)">저장되었습니다.</span>{/if}
					{#if saveError}<span class="text-caption" style:color="var(--danger)">{saveError}</span>{/if}
				</div>
			</form>
		</section>
	{/if}

	<section aria-labelledby="members">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="members" class="border-t border-line pt-4 text-title-l">멤버·권한</h2>
			<p class="tabular text-caption text-muted">{admin.members.length}명</p>
		</div>

		<div class="mt-3 border-line">
			<DataTable caption="서버 멤버" {columns} items={admin.members}>
				{#snippet row(member)}
					<tr>
						<th scope="row">
							<span class="block truncate font-semibold">{member.player.displayName}</span>
							<span class="block truncate text-caption text-muted">{member.player.riotId ?? 'Riot 계정 미연결'}</span>
						</th>
						<td data-label="권한" class="hide-in-stack">{member.role === 'admin' ? '관리자' : '일반'}</td>
						<td data-label="연결일" class="hide-in-stack text-muted">{member.joinedAt.slice(0, 10)}</td>
						<td data-label="관리" class="text-end">
							{#if admin.capabilities.canChangeRoles}
								<Button
									size="auto"
									injClass="px-3"
									fill="line"
									onclick={() =>
										(roleTarget = {
											userId: member.player.userId ?? '',
											displayName: member.player.displayName,
											nextRole: member.role === 'admin' ? 'member' : 'admin'
										})}
									disabled={!member.player.userId}
								>
									{member.role === 'admin' ? '관리자 해제' : '관리자 지정'}
								</Button>
							{/if}
						</td>
					</tr>
				{/snippet}
			</DataTable>
		</div>
	</section>
</div>

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
