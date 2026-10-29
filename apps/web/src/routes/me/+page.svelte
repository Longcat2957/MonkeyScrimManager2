<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button, Input } from 'stdf';
	import { linkRiotAccount, savePrivacy, unlinkRiotAccount } from '#lib/data/index.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import StatusTag from '#lib/components/ui/StatusTag.svelte';
	import TaskDialog from '#lib/components/ui/TaskDialog.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const viewer = $derived(data.viewer ?? null);
	const profile = $derived(data.profile);

	// 계정 연결 패널
	let linkOpen = $state(false);
	let gameName = $state('');
	let tagLine = $state('');
	let linking = $state(false);
	let linkError = $state<string | null>(null);

	const canLink = $derived(gameName.trim().length > 0 && tagLine.trim().length > 0 && !linking);

	async function submitLink() {
		if (!canLink) return;
		linking = true;
		linkError = null;
		try {
			const account = await linkRiotAccount(gameName.trim(), tagLine.trim());
			if (!account) {
				linkError = '이미 연결된 Riot ID입니다. 다른 계정을 확인해 주세요.';
				return;
			}
			linkOpen = false;
			gameName = '';
			tagLine = '';
			await invalidateAll();
		} catch {
			linkError = '계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
		} finally {
			linking = false;
		}
	}

	// 연결 해제 확인
	let unlinkTarget = $state<string | null>(null);
	let unlinking = $state(false);

	async function runUnlink() {
		if (!unlinkTarget || unlinking) return;
		unlinking = true;
		try {
			await unlinkRiotAccount(unlinkTarget);
			unlinkTarget = null;
			await invalidateAll();
		} finally {
			unlinking = false;
		}
	}

	// 공개 범위
	let publicProfile = $state(untrack(() => profile.privacy.publicProfile));
	let showRiotIds = $state(untrack(() => profile.privacy.showRiotIds));
	let saving = $state(false);
	let saved = $state(false);
	let saveError = $state<string | null>(null);

	const dirty = $derived(
		publicProfile !== profile.privacy.publicProfile || showRiotIds !== profile.privacy.showRiotIds
	);

	async function submitPrivacy() {
		saving = true;
		saveError = null;
		saved = false;
		try {
			await savePrivacy({ publicProfile, showRiotIds });
			await invalidateAll();
			saved = true;
		} catch {
			saveError = '공개 범위를 저장하지 못했어요.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('내 정보')}</title>
</svelte:head>

<PageHeader title="내 정보" description={viewer ? `${viewer.displayName} · Discord 계정` : undefined} />

<div class="measure space-y-12">
	<section aria-labelledby="accounts">
		<div class="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4">
			<h2 id="accounts" class="text-title-l">연결한 Riot 계정</h2>
			<Button size="auto" injClass="px-4" fill="base" state="theme" onclick={() => (linkOpen = true)}>
				계정 연결
			</Button>
		</div>

		{#if profile.accounts.length === 0}
			<p class="mt-3 text-body-s text-muted">
				연결된 Riot 계정이 없습니다. 계정을 연결하면 참가 신청과 ROFL 기록 연결에 사용합니다.
			</p>
		{:else}
			<ul class="mt-3 divide-hairline">
				{#each profile.accounts as account (account.id)}
					<li class="flex flex-wrap items-center justify-between gap-3 py-3">
						<div class="min-w-0">
							<p class="truncate font-semibold">{account.gameName}#{account.tagLine}</p>
							<p class="text-caption text-muted">{account.platform}</p>
						</div>
						<div class="flex items-center gap-2">
							<StatusTag
								status={account.verified
									? { text: '확인됨', tone: 'success' }
									: { text: '확인 대기', tone: 'warning' }}
							/>
							<Button size="auto" injClass="px-3" fill="line" state="error" onclick={() => (unlinkTarget = account.id)}>
								해제
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="privacy">
		<h2 id="privacy" class="border-t border-line pt-4 text-title-l">공개 범위</h2>

		<form
			class="mt-3 space-y-4"
			onsubmit={(event) => {
				event.preventDefault();
				submitPrivacy();
			}}
		>
			<label class="flex min-h-11 items-start gap-3">
				<input type="checkbox" bind:checked={publicProfile} class="mt-1 size-4" style:accent-color="var(--action-bg)" />
				<span>
					<span class="block text-body-s font-semibold">프로필 공개</span>
					<span class="block text-caption text-muted">같은 서버의 다른 참가자가 내 전적을 볼 수 있습니다.</span>
				</span>
			</label>

			<label class="flex min-h-11 items-start gap-3">
				<input type="checkbox" bind:checked={showRiotIds} class="mt-1 size-4" style:accent-color="var(--action-bg)" />
				<span>
					<span class="block text-body-s font-semibold">Riot ID 표시</span>
					<span class="block text-caption text-muted">과거 경기 기록에도 현재 설정이 적용됩니다.</span>
				</span>
			</label>

			<div class="flex flex-wrap items-center gap-3 pt-1">
				<Button
					type="submit"
					size="auto"
					injClass="px-4"
					fill="base"
					state="theme"
					disabled={!dirty}
					loading={saving ? { height: '4', width: '4' } : null}
				>
					공개 범위 저장
				</Button>
				{#if saved && !dirty}<span class="text-caption" style:color="var(--success)">저장되었습니다.</span>{/if}
				{#if saveError}<span class="text-caption" style:color="var(--danger)">{saveError}</span>{/if}
			</div>
		</form>
	</section>
</div>

<TaskDialog
	bind:open={linkOpen}
	title="Riot 계정 연결"
	description="Riot ID를 입력하면 계정을 확인한 뒤 연결합니다. 소유권 확인은 별도로 진행됩니다."
	submitLabel="연결"
	cancelLabel="취소"
	pending={linking}
	submitError={linkError}
	canSubmit={canLink}
	onsubmit={submitLink}
	onclosed={() => (linkError = null)}
>
	<div class="space-y-4">
		<Input title="Riot ID 이름" bind:value={gameName} maxlength={24} py="2" placeholder="예: Hide on bush" />
		<Input title="태그" bind:value={tagLine} maxlength={8} py="2" placeholder="예: KR1" />
	</div>
</TaskDialog>

<ConfirmDialog
	bind:open={() => unlinkTarget !== null, (value) => (unlinkTarget = value ? unlinkTarget : null)}
	title="연결을 해제할까요?"
	content="해제해도 과거 경기 기록은 남습니다. 진행 중인 참가 신청이 있으면 먼저 확인해 주세요."
	confirmLabel="해제"
	danger
	pending={unlinking}
	onconfirm={runUnlink}
/>
