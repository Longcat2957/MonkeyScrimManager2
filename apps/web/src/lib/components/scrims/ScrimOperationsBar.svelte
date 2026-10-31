<script lang="ts">
	import { Button, toast } from 'stdf';
	import type { ActionProps } from 'stdf';
	import { invalidateAll } from '$app/navigation';
	import ActionMenu from '#lib/components/common/ActionMenu.svelte';
	import type { ScrimNextAction, ScrimSettings, ScrimSettingsField } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import ScrimSettingsDialog from './ScrimSettingsDialog.svelte';

	type Props = {
		nextAction: ScrimNextAction | null;
		settings: ScrimSettings;
		editable: ScrimSettingsField[];
	};

	let { nextAction, settings, editable }: Props = $props();

	let menuOpen = $state(false);
	let editing = $state(false);
	let advancing = $state(false);
	let trigger = $state<HTMLElement | null>(null);

	const actions: ActionProps[] = [{ content: '내전 설정 수정' }, { content: '내전 취소', style: 'error' }];

	async function advance() {
		if (!nextAction) return;
		if (!(await confirm('이전 단계로 되돌릴 수 없어요. 진행할까요?', nextAction.label))) return;
		advancing = true;
		const message = await postAction('advance', { key: nextAction.key });
		advancing = false;
		if (message) toast.error(message);
	}

	async function onselect(index: number) {
		menuOpen = false;
		if (index === 0) {
			editing = true;
			return;
		}
		const ok = await confirm('이 내전을 취소할까요? 취소하면 되돌릴 수 없어요.', '내전 취소');
		if (!ok) return;
		const message = await postAction('cancel', {});
		if (message) toast.error(message);
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
		<div class="flex shrink-0 items-center gap-2">
			<span bind:this={trigger}>
				<Button fill="lineLight" size="auto" heightOut="0" heightIn="2" injClass="px-3" onclick={() => (menuOpen = true)}>
					<span aria-hidden="true" class="leading-none">⋯</span>
					<span class="sr-only">운영 메뉴</span>
				</Button>
			</span>
			{#if nextAction}
				<Button
					size="auto"
					heightOut="0"
					heightIn="2"
					injClass="px-4 text-sm"
					disabled={Boolean(nextAction.blockedReason)}
					loading={advancing ? {} : null}
					onclick={advance}
				>
					{nextAction.label}
				</Button>
			{/if}
		</div>
	</div>

	<ActionMenu bind:open={menuOpen} label="운영 메뉴" {actions} {trigger} {onselect} />
	<ScrimSettingsDialog
		bind:open={editing}
		title="내전 설정 수정"
		submitText="저장"
		action="settings"
		initial={settings}
		{editable}
		onsaved={() => invalidateAll()}
	/>
</section>
