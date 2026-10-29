<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Button, Dialog } from 'stdf';
	import ModalBoundary from '#lib/components/common/ModalBoundary.svelte';
	import RiotAccountLinkForm from '#lib/components/me/RiotAccountLinkForm.svelte';
	import type { RiotAccount } from '#lib/features/me/types.ts';

	interface Props {
		accounts: RiotAccount[];
		onlookup: (gameName: string, tagLine: string) => Promise<RiotAccount>;
		onlink: (account: RiotAccount) => Promise<void>;
		onunlink: (accountId: string) => Promise<void>;
	}

	let { accounts, onlookup, onlink, onunlink }: Props = $props();
	const id = $props.id();
	let connected = $state<RiotAccount[]>(untrack(() => [...accounts]));
	let linking = $state(false);
	let removing = $state<RiotAccount | null>(null);
	let pending = $state(false);
	let errorMessage = $state('');
	let feedback = $state('');
	let addControl: HTMLDivElement | undefined = $state();

	async function lookup(gameName: string, tagLine: string) {
		const account = await onlookup(gameName, tagLine);
		if (connected.some((item) => item.id === account.id)) throw new Error('이미 연결한 계정입니다. 다른 Riot ID를 입력해 주세요.');
		return account;
	}

	async function link(account: RiotAccount) {
		if (connected.some((item) => item.id === account.id)) throw new Error('이미 연결한 계정입니다.');
		await onlink(account);
		connected = [...connected, account];
		feedback = `${account.gameName}#${account.tagLine} 계정을 연결했습니다.`;
	}

	function closeRemoval() {
		if (pending) return;
		removing = null;
		errorMessage = '';
	}

	async function unlink() {
		if (!removing || pending) return;
		const account = removing;
		pending = true;
		errorMessage = '';
		try {
			await onunlink(account.id);
			connected = connected.filter((item) => item.id !== account.id);
			feedback = `${account.gameName}#${account.tagLine} 계정의 연결을 해제했습니다.`;
			removing = null;
			await tick();
			// 해제한 행이 사라지므로 남아 있는 계정 연결 조작으로 초점을 옮긴다.
			addControl?.querySelector('button')?.focus({ preventScroll: true });
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : '연결을 해제하지 못했습니다. 다시 시도해 주세요.';
		} finally {
			pending = false;
		}
	}
</script>

<section class="space-y-5" aria-labelledby={`${id}-heading`}>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id={`${id}-heading`} class="text-xl font-semibold">연결한 Riot 계정</h2>
		<div bind:this={addControl}>
			<Button size="md" heightOut="0" injClass="app-button" onclick={() => { feedback = ''; linking = true; }}>계정 연결</Button>
		</div>
	</div>

	{#if connected.length}
		<ul class="divide-y divide-border border-y border-border">
			{#each connected as account (account.id)}
				<li class="flex flex-wrap items-center justify-between gap-3 py-5">
					<div class="min-w-0 flex-1 basis-48">
						<p class="break-words font-medium">{account.gameName}<span class="ml-1 font-normal opacity-60">#{account.tagLine}</span></p>
						<p class="mt-1 text-sm opacity-60">{account.platform}</p>
					</div>
					<Button fill="text" size="sm" heightOut="0" injClass="app-button" onclick={() => { feedback = ''; errorMessage = ''; removing = account; }}>
						연결 해제<span class="sr-only">: {account.gameName}#{account.tagLine}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="border-y border-border py-8 text-sm leading-6 opacity-70">아직 연결한 Riot 계정이 없습니다.</p>
	{/if}
	<p role="status" aria-live="polite" class="text-sm leading-6 wrap-anywhere">{feedback}</p>
</section>

{#if linking}
	<RiotAccountLinkForm onlookup={lookup} onlink={link} onclose={() => (linking = false)} />
{/if}

{#if removing}
	{@const account = removing}
	<ModalBoundary open title="계정 연결 해제" onclose={closeRemoval} closeDisabled={pending}>
		<Dialog
			visible={true}
			title="계정 연결을 해제할까요?"
			titleAlign="left"
			primaryText={pending ? '해제 중' : '연결 해제'}
			secondaryText="취소"
			secondaryClose={false}
			primaryButton={{ state: 'error', disabled: pending, loading: pending ? { width: '4', height: '4', inverse: true } : null, injClass: 'app-button' }}
			secondaryButton={{ disabled: pending, injClass: 'app-button' }}
			popup={{ mask: { visible: false }, maskClosable: false, duration: 0, outDuration: 0, px: '4', py: '4' }}
			onprimary={unlink}
			onsecondary={closeRemoval}
		>
			{#snippet contentChild()}
				<div class="space-y-3 text-sm leading-7">
					<p class="break-words font-semibold">{account.gameName}#{account.tagLine}</p>
					<p>기존 내전 기록은 그대로 남습니다.</p>
					{#if errorMessage}<p role="alert" class="text-error dark:text-text-dark">{errorMessage}</p>{/if}
				</div>
			{/snippet}
		</Dialog>
	</ModalBoundary>
{/if}
