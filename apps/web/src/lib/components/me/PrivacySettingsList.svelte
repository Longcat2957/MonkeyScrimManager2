<script lang="ts">
	import { CellGroup, toast } from 'stdf';
	import SwitchCell from '#lib/components/common/SwitchCell.svelte';
	import type { PrivacyKey, PrivacySettings } from '#lib/features/me/types.ts';
	import { postAction } from '#lib/ui/actions.ts';

	let { privacy }: { privacy: PrivacySettings } = $props();

	const items: { key: PrivacyKey; title: string; description: string }[] = [
		{ key: 'profilePublic', title: '프로필 공개', description: '같은 서버 멤버가 내 전적 페이지를 볼 수 있어요' },
		{ key: 'showRiotId', title: 'Riot ID 표시', description: '경기 기록과 참가자 목록에 Riot ID를 보여줘요' }
	];

	// 화면 값은 서버 값을 따르되 토글 즉시 덮어쓰고, 저장에 실패하면 되돌린다.
	let values = $derived({ ...privacy });
	let saving = $state<PrivacyKey | null>(null);

	function setValue(key: PrivacyKey, value: boolean) {
		// STDF Switch가 같은 값을 다시 써 넣을 때 새 객체를 만들면 갱신이 끝없이 반복되므로 바뀐 경우만 반영한다.
		if (values[key] === value) return;
		values = { ...values, [key]: value };
	}

	async function save(key: PrivacyKey) {
		const next = values[key];
		saving = key;
		const message = await postAction('privacy', { key, value: String(next) });
		saving = null;
		if (message) {
			setValue(key, !next);
			toast.error(message);
		}
	}
</script>

<section aria-labelledby="privacy" class="flex flex-col gap-3">
	<div class="flex flex-col gap-1">
		<h2 id="privacy" class="text-lg font-semibold">공개 범위</h2>
		<p class="text-sm opacity-70">설정과 관계없이 서버 안의 경기 결과와 통계에는 계속 포함돼요.</p>
	</div>
	<CellGroup my="0" mx="0" shadow="none">
		{#each items as item, index (item.key)}
			<SwitchCell
				title={item.title}
				subTitle={item.description}
				bind:active={() => values[item.key], (value) => setValue(item.key, value)}
				disabled={saving !== null}
				line={index < items.length - 1}
				onchange={() => save(item.key)}
			/>
		{/each}
	</CellGroup>
</section>
