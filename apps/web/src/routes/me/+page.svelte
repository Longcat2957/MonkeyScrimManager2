<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Input } from 'stdf';
	import { linkRiotAccount, savePrivacy, unlinkRiotAccount } from '#lib/data/index.ts';
	import { pageTitle } from '#lib/shell/titles.ts';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import StatusState from '#lib/components/ui/StatusState.svelte';
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

	// 공개 범위: 바꾸면 바로 저장한다(저장 버튼을 따로 두지 않는다).
	let publicProfile = $state(untrack(() => profile.privacy.publicProfile));
	let showRiotIds = $state(untrack(() => profile.privacy.showRiotIds));
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	async function persist(next: { publicProfile: boolean; showRiotIds: boolean }) {
		saving = true;
		saveError = null;
		try {
			await savePrivacy(next);
			await invalidateAll();
		} catch {
			saveError = '공개 범위를 저장하지 못했어요.';
			// 실패하면 원래 값으로 되돌린다.
			publicProfile = profile.privacy.publicProfile;
			showRiotIds = profile.privacy.showRiotIds;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('내 정보')}</title>
</svelte:head>

<h1 class="page-title">내 정보</h1>
{#if viewer}
	<p class="mt-1.5 text-[13px] text-mut">{viewer.displayName} · Discord 계정</p>
{/if}

<div class="measure mt-8 space-y-10">
	<section aria-labelledby="accounts">
		<div class="region">
			<span class="lbl" id="accounts">연결한 Riot 계정</span>
		</div>

		{#if profile.accounts.length === 0}
			<div class="panel px-5 py-5">
				<p class="text-[13px] text-mut">
					연결된 Riot 계정이 없습니다. 계정을 연결하면 참가 신청과 ROFL 기록 연결에 사용합니다.
				</p>
				<button type="button" class="btn mt-3" onclick={() => (linkOpen = true)}>계정 연결</button>
			</div>
		{:else}
			<ul class="panel">
				{#each profile.accounts as account (account.id)}
					<li class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
						<div class="min-w-0">
							<p class="truncate text-[14px] font-bold">{account.gameName}#{account.tagLine}</p>
							<p class="text-[11.5px] text-faint">{account.platform}</p>
						</div>
						<div class="flex items-center gap-3">
							<StatusState
								status={account.verified
									? { text: '확인됨', tone: 'done' }
									: { text: '확인 대기', tone: 'wait' }}
							/>
							<button
								type="button"
								class="btn btn--text min-h-9 px-2 text-rose"
								onclick={() => (unlinkTarget = account.id)}
							>
								해제
							</button>
						</div>
					</li>
				{/each}
				<li class="border-t border-line">
					<button type="button" class="row w-full text-left" onclick={() => (linkOpen = true)}>
						<span class="row-title text-accent">+ 계정 연결</span>
						<span></span>
						<span></span>
					</button>
				</li>
			</ul>
		{/if}
	</section>

	<section aria-labelledby="privacy">
		<div class="region">
			<span class="lbl" id="privacy">공개 범위</span>
			{#if saving}<span class="count">저장 중…</span>{/if}
		</div>

		<div class="panel divide-y divide-line">
			<label class="flex min-h-14 cursor-pointer items-start gap-3 px-5 py-3.5">
				<input
					type="checkbox"
					bind:checked={publicProfile}
					onchange={() => persist({ publicProfile, showRiotIds })}
					class="mt-0.5 size-4"
					style:accent-color="var(--accent)"
				/>
				<span class="min-w-0">
					<span class="block text-[14px] font-semibold">프로필 공개</span>
					<span class="block text-[11.5px] text-faint">같은 서버의 다른 참가자가 내 전적을 볼 수 있습니다.</span>
				</span>
			</label>

			<label class="flex min-h-14 cursor-pointer items-start gap-3 px-5 py-3.5">
				<input
					type="checkbox"
					bind:checked={showRiotIds}
					onchange={() => persist({ publicProfile, showRiotIds })}
					class="mt-0.5 size-4"
					style:accent-color="var(--accent)"
				/>
				<span class="min-w-0">
					<span class="block text-[14px] font-semibold">Riot ID 표시</span>
					<span class="block text-[11.5px] text-faint">과거 경기 기록에도 현재 설정이 적용됩니다.</span>
				</span>
			</label>
		</div>

		{#if saveError}<p class="mt-2 text-[11.5px] text-rose">{saveError}</p>{/if}
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
