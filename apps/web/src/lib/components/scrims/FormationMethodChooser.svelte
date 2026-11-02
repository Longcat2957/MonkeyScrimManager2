<script lang="ts">
	import { Loading, toast } from 'stdf';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { formationPath } from '#lib/features/scrims/paths.ts';
	import type { FormationMethod, ScrimStatus } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import { confirm } from '#lib/ui/confirm.ts';

	// 운영자가 모집 중·편성 중에 편성 방식을 고르거나 바꾼다. 편성 중이면 고른 방식의 작업판으로 간다.
	let { method, status }: { method: FormationMethod | null; status: ScrimStatus } = $props();

	const METHODS: { name: FormationMethod; title: string; description: string }[] = [
		{ name: 'manual', title: '수동 편성', description: '운영자가 참가자를 팀 자리에 직접 배치해요' },
		{ name: 'auction', title: '경매', description: '팀장을 정하고 포인트로 입찰해 팀원을 데려가요' }
	];

	let pending = $state<FormationMethod | null>(null);

	async function choose(next: FormationMethod) {
		if (next === method) return;
		// 편성을 시작한 뒤 바꾸면 지금까지의 배치·경매 기록이 지워진다.
		if (status === 'preparing' && method && !(await confirm('지금까지의 편성을 지우고 편성 방식을 바꿀까요?', '편성 방식 바꾸기'))) return;
		pending = next;
		const message = await postAction('chooseMethod', { method: next });
		if (message) toast.error(message);
		else if (status === 'preparing') await goto(formationPath({ guildId: page.params.guildId!, scrimId: page.params.scrimId! }, next)!);
		pending = null;
	}
</script>

<section aria-labelledby="formation-method" aria-busy={Boolean(pending)} class="flex flex-col gap-3 px-4 py-3">
	<h2 id="formation-method" class="text-sm font-semibold">편성 방식</h2>
	<!-- 두 방식을 같은 크기의 선택 칸으로 1px 경계에 붙여 둔다. 고른 방식은 테두리와 태그로 표시한다. -->
	<div class="grid gap-px rounded-(--radius-form) border border-border bg-border sm:grid-cols-2">
		{#each METHODS as item, index (item.name)}
			{@const selected = item.name === method}
			<button
				type="button"
				aria-pressed={selected}
				disabled={Boolean(pending)}
				class={[
					'flex min-h-24 flex-col items-start gap-1.5 p-4 text-left transition disabled:cursor-wait',
					index === 0 ? 'rounded-t-(--radius-form) sm:rounded-l-(--radius-form) sm:rounded-tr-none' : 'rounded-b-(--radius-form) sm:rounded-r-(--radius-form) sm:rounded-bl-none',
					selected
						? 'bg-bg-overlay ring-2 ring-primary ring-inset dark:bg-bg-overlay-dark dark:ring-dark'
						: 'bg-bg-surface enabled:hover:bg-bg-overlay dark:bg-bg-surface-dark dark:enabled:hover:bg-bg-overlay-dark'
				]}
				onclick={() => choose(item.name)}
			>
				<span class="flex items-center gap-2 text-base font-semibold">
					{item.title}
					{#if selected}<StatusTag text="선택됨" state="theme" />{/if}
					{#if pending === item.name}<Loading type="1_0" height="6" width="6" />{/if}
				</span>
				<span class="text-sm opacity-70">{item.description}</span>
			</button>
		{/each}
	</div>
</section>
