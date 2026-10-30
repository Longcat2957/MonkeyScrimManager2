<script lang="ts">
	import { Button, Cell, CellGroup, Loading, toast } from 'stdf';
	import type { ActionProps } from 'stdf';
	import ActionMenu from '#lib/components/common/ActionMenu.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import type { RiotAccount } from '#lib/features/me/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import AddRiotAccountDialog from './AddRiotAccountDialog.svelte';

	let { accounts }: { accounts: RiotAccount[] } = $props();

	let adding = $state(false);
	let menuOpen = $state(false);
	let selected = $state<RiotAccount | null>(null);
	let pendingId = $state<string | null>(null);
	const rows: Record<string, HTMLElement> = $state({});

	const actions = $derived<ActionProps[]>(
		selected
			? [
					selected.isPrimary
						? { content: '대표로 설정', desc: '이미 대표 계정이에요', disabled: true }
						: { content: '대표로 설정', desc: '내전 신청 때 기본으로 선택돼요' },
					selected.inActiveScrim
						? { content: '연결 해제', desc: '진행 중인 내전에 쓰이고 있어요', disabled: true }
						: { content: '연결 해제', style: 'error' }
				]
			: []
	);

	function openMenu(account: RiotAccount) {
		if (pendingId) return;
		selected = account;
		menuOpen = true;
	}

	async function run(account: RiotAccount, name: 'primary' | 'unlink') {
		pendingId = account.id;
		const message = await postAction(name, { id: account.id });
		pendingId = null;
		if (message) toast.error(message);
	}

	async function onAction(index: number) {
		const account = selected;
		menuOpen = false;
		if (!account) return;
		if (index === 0) return run(account, 'primary');
		const ok = await confirm(
			`${account.gameName}#${account.tagLine} 연결을 해제할까요? 지난 경기 기록은 그대로 남아요.`,
			'연결 해제'
		);
		if (ok) await run(account, 'unlink');
	}
</script>

<section aria-labelledby="riot-accounts">
	<div class="flex flex-col gap-3">
		<div class="flex items-end justify-between gap-4">
			<div class="flex flex-col gap-1">
				<h2 id="riot-accounts" class="text-lg font-semibold">Riot 계정</h2>
				<p class="text-sm opacity-70">내전에 참가 신청할 때 이 계정 중 하나를 골라요.</p>
			</div>
			<span class="shrink-0">
				<Button
					fill="lineLight"
					size="auto"
					heightOut="0"
					heightIn="2"
					injClass="px-3 text-sm"
					onclick={() => (adding = true)}
				>
					계정 추가
				</Button>
			</span>
		</div>

		{#if accounts.length}
			<CellGroup my="0" mx="0" shadow="none">
				{#each accounts as account, index (account.id)}
					<div bind:this={rows[account.id]}>
						<Cell
							title={account.gameName}
							subTitle={`#${account.tagLine} · ${account.region} 서버`}
							line={index < accounts.length - 1}
							my="0"
							mx="0"
							shadow="none"
							radius="none"
							onclick={() => openMenu(account)}
						>
							{#snippet detailChild()}
								{#if pendingId === account.id}
									<Loading type="1_0" height="6" width="6" />
								{:else if account.isPrimary}
									<StatusTag text="대표" state="theme" />
								{/if}
							{/snippet}
						</Cell>
					</div>
				{/each}
			</CellGroup>
		{:else}
			<SectionState state="empty" message="연결한 Riot 계정이 없어요" />
		{/if}
	</div>

	<!-- 메뉴와 팝업은 화면에 자리를 차지하지 않으므로 목록 간격 밖에 둔다. -->
	<ActionMenu
		bind:open={menuOpen}
		label={selected ? `${selected.gameName}#${selected.tagLine}` : '계정 작업'}
		{actions}
		trigger={selected ? rows[selected.id] : null}
		onselect={onAction}
	/>
	<AddRiotAccountDialog bind:open={adding} />
</section>
