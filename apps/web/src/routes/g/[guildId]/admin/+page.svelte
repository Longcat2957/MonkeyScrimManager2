<script lang="ts">
	import { CellGroup, Input, toast } from 'stdf';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import PageNav from '#lib/components/common/PageNav.svelte';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import SwitchCell from '#lib/components/common/SwitchCell.svelte';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import { nonSubmitButtons } from '#lib/ui/form.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');
	// 저장을 취소하거나 실패하면 스위치를 서버 값으로 되돌리기 위해 목록을 다시 그린다.
	let version = $state(0);
	$effect(() => {
		query = data.q;
	});

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

	// 켜기는 바로 저장하고, 끄기는 확인한 뒤 저장한다.
	async function change(member: { userId: string; displayName: string }, isAdmin: boolean) {
		if (!isAdmin && !(await confirm(`${member.displayName}님의 관리자 권한을 회수할까요?`, '관리자 권한 회수'))) {
			version++;
			return;
		}
		const message = await postAction('setAdmin', { userId: member.userId, isAdmin: String(isAdmin) });
		if (message) {
			toast.error(message);
			version++;
		}
	}

	// 자신과 마지막 관리자는 바꿀 수 없으므로 스위치를 고정하고 이유를 쓴다.
	function lockReason(member: { userId: string; isAdmin: boolean }) {
		if (member.userId === data.me) return '자신의 권한은 바꿀 수 없어요';
		if (member.isAdmin && data.adminCount === 1) return '마지막 관리자예요';
		return '';
	}
</script>

<svelte:head>
	<title>서버 관리 | {SERVICE_NAME}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<h1 class="text-2xl font-semibold">서버 관리</h1>

	<section aria-labelledby="admins" class="flex flex-col gap-3">
		<div class="flex items-baseline justify-between gap-3">
			<h2 id="admins" class="text-lg font-semibold">관리자</h2>
			<span class="text-sm opacity-60 tabular-nums">관리자 {data.adminCount}명</span>
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
			<CellGroup my="0" mx="0" shadow="none">
				{#key version}
					<ul>
						{#each data.members as member, index (member.userId)}
							{@const reason = lockReason(member)}
							<li>
								<SwitchCell
									title={member.displayName}
									subTitle={reason}
									active={member.isAdmin}
									disabled={Boolean(reason)}
									line={index < data.members.length - 1}
									onchange={(active) => change(member, active)}
								>
									{#snippet leftChild()}<PlayerFace name={member.displayName} imageUrl={null} />{/snippet}
								</SwitchCell>
							</li>
						{/each}
					</ul>
				{/key}
			</CellGroup>
		{/if}

		<PageNav total={data.total} pageSize={data.pageSize} current={data.page} onchange={(current) => navigate({ page: current })} />
	</section>
</div>
