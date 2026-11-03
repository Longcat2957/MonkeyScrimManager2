<script lang="ts">
	import { Button, toast } from 'stdf';
	import type { ActionProps } from 'stdf';
	import { invalidateAll } from '$app/navigation';
	import ActionMenu from '#lib/components/common/ActionMenu.svelte';
	import type { ScrimNextAction, ScrimRevertAction, ScrimSettings, ScrimSettingsField } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import ScrimSettingsDialog from './ScrimSettingsDialog.svelte';

	type Props = {
		nextAction: ScrimNextAction | null;
		revert: ScrimRevertAction | null;
		endEarly: boolean;
		// 끝난 내전은 취소할 수 없다.
		cancellable: boolean;
		settings: ScrimSettings;
		editable: ScrimSettingsField[];
	};

	let { nextAction, revert, endEarly, cancellable, settings, editable }: Props = $props();

	type MenuItem = { key: 'settings' | 'revert' | 'endEarly' | 'cancel'; action: ActionProps };

	let menuOpen = $state(false);
	let editing = $state(false);
	let advancing = $state(false);
	let trigger = $state<HTMLElement | null>(null);

	// 단계마다 쓸 수 있는 항목만 둔다. 되돌릴 수 없는 단계면 이유를 설명 줄에 쓰고 비활성으로 둔다.
	const menu = $derived.by(() => {
		const items: MenuItem[] = [];
		if (editable.length) items.push({ key: 'settings', action: { content: '내전 설정 수정' } });
		if (revert) items.push({ key: 'revert', action: { content: revert.label, desc: revert.blockedReason ?? undefined, disabled: Boolean(revert.blockedReason) } });
		if (endEarly) items.push({ key: 'endEarly', action: { content: '중도 종료', style: 'error' } });
		if (cancellable) items.push({ key: 'cancel', action: { content: '내전 취소', style: 'error' } });
		return items;
	});

	const CONFIRM: Record<ScrimNextAction['key'], string> = {
		close: '모집을 마감할까요?',
		ready: '대진 준비로 넘어갈까요?',
		start: '내전을 시작할까요?',
		complete: '내전을 종료할까요?'
	};

	async function advance() {
		if (!nextAction) return;
		const key = nextAction.key;
		if (!(await confirm(CONFIRM[key], nextAction.label))) return;
		advancing = true;
		const message = await postAction('advance', { key });
		advancing = false;
		if (message) toast.error(message);
	}

	async function run(name: string, message: string, title: string) {
		if (!(await confirm(message, title))) return;
		const failure = await postAction(name, {});
		if (failure) toast.error(failure);
	}

	async function onselect(index: number) {
		menuOpen = false;
		const key = menu[index]?.key;
		if (key === 'settings') editing = true;
		else if (key === 'revert' && revert) await run('revert', revert.message, revert.label);
		else if (key === 'endEarly') await run('endEarly', '남은 경기를 치르지 않고 내전을 끝낼까요? 지금까지 기록된 게임과 점수는 전적에 남아요.', '중도 종료');
		else if (key === 'cancel') await run('cancel', '이 내전을 취소할까요? 취소하면 되돌릴 수 없어요.', '내전 취소');
	}
</script>

<!-- 운영자의 단계 진행과 내전 관리. 작업 헤더처럼 한 줄에 두고 진행 조건이 안 맞으면 이유를 왼쪽에 쓴다. -->
<section aria-labelledby="operations">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
		<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
			<h2 id="operations" class="text-sm font-semibold">운영</h2>
			{#if nextAction?.blockedReason}
				<span class="text-sm opacity-70">{nextAction.blockedReason}</span>
			{/if}
		</div>
		<div class="ml-auto flex shrink-0 items-center gap-2">
			{#if menu.length}
				<span bind:this={trigger}>
					<Button fill="lineLight" size="auto" heightOut="0" heightIn="2" injClass="px-3" onclick={() => (menuOpen = true)}>
						<span aria-hidden="true" class="leading-none">⋯</span>
						<span class="sr-only">운영 메뉴</span>
					</Button>
				</span>
			{/if}
			{#if nextAction}
				<!-- 다음 단계는 내전을 앞으로 넘기는 유일한 버튼이라 관리 메뉴와 선으로 나누고 화살표를 붙여 구분한다. -->
				{#if menu.length}<span aria-hidden="true" class="mx-1 h-6 w-px bg-border"></span>{/if}
				<Button
					size="auto"
					heightOut="0"
					heightIn="2"
					injClass="gap-2 px-5 text-sm font-semibold shadow-sm"
					disabled={Boolean(nextAction.blockedReason)}
					loading={advancing ? {} : null}
					onclick={advance}
				>
					{nextAction.label}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</Button>
			{/if}
		</div>
	</div>

	<ActionMenu bind:open={menuOpen} label="운영 메뉴" actions={menu.map((item) => item.action)} {trigger} {onselect} />
	{#if editable.length}
		<ScrimSettingsDialog
			bind:open={editing}
			title="내전 설정 수정"
			submitText="저장"
			action="settings"
			initial={settings}
			{editable}
			onsaved={() => invalidateAll()}
		/>
	{/if}
</section>
