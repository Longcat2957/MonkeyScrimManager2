<script lang="ts">
	import { Loading, toast } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import type { FormationMethod } from '#lib/features/scrims/types.ts';
	import { postAction } from '#lib/ui/actions.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const METHODS: { name: FormationMethod; title: string; description: string }[] = [
		{ name: 'manual', title: '수동 편성', description: '운영자가 참가자를 팀 자리에 직접 배치해요' },
		{ name: 'auction', title: '경매', description: '팀장을 정하고 포인트로 입찰해 팀원을 데려가요' }
	];

	let pending = $state<FormationMethod | null>(null);

	const status = $derived(data.scrim?.status);
	// 방식을 고를 수 없는 이유. 운영자가 지금 고를 수 있으면 비운다.
	const hint = $derived.by(() => {
		if (status === 'recruit') return data.scrim?.canManage ? '선발 인원이 다 차면 요약에서 모집을 마감한 뒤 골라요' : '모집이 마감되면 운영자가 골라요';
		if (status === 'preparing' && !data.can.choose) return '운영자가 편성 방식을 고르고 있어요';
		return null;
	});

	// 성공하면 다시 불러온 load가 고른 방식의 페이지로 보낸다.
	async function choose(method: FormationMethod) {
		pending = method;
		const message = await postAction('choose', { method });
		pending = null;
		if (message) toast.error(message);
	}
</script>

<svelte:head>
	<title>{data.scrim?.title ?? '팀 편성'} · 팀 편성 | {SERVICE_NAME}</title>
</svelte:head>

<section aria-labelledby="formation-method" aria-busy={Boolean(pending)} class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 id="formation-method" class="text-xl font-semibold">편성 방식</h2>
		{#if hint}<p class="text-sm opacity-70">{hint}</p>{/if}
	</div>

	{#if status === 'cancelled'}
		<p>취소된 내전이라 팀을 편성하지 않아요.</p>
	{:else}
		<!-- 두 방식을 같은 크기의 선택 칸으로 둔다. 고를 수 없을 때도 어떤 방식이 있는지 보이게 비활성으로 남긴다. -->
		<div class="grid gap-px overflow-hidden rounded-(--radius-box) border border-border bg-border sm:grid-cols-2">
			{#each METHODS as method (method.name)}
				<button
					type="button"
					disabled={!data.can.choose || Boolean(pending)}
					class="flex min-h-36 flex-col items-start gap-2 bg-bg-surface p-6 text-left transition enabled:hover:bg-bg-overlay disabled:cursor-not-allowed dark:bg-bg-surface-dark dark:enabled:hover:bg-bg-overlay-dark [&:disabled>*]:opacity-50"
					onclick={() => choose(method.name)}
				>
					<span class="flex items-center gap-2 text-lg font-semibold">
						{method.title}
						{#if pending === method.name}<Loading type="1_0" height="6" width="6" />{/if}
					</span>
					<span class="text-sm opacity-70">{method.description}</span>
				</button>
			{/each}
		</div>
	{/if}
</section>
