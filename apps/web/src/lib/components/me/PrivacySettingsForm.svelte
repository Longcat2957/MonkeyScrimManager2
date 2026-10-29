<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from 'stdf';
	import type { PrivacySettings } from '#lib/features/me/types.ts';

	interface Props {
		value: PrivacySettings;
		onsave: (value: PrivacySettings) => Promise<PrivacySettings>;
	}

	let { value, onsave }: Props = $props();
	const id = $props.id();
	const fields: { key: keyof PrivacySettings; label: string; description: string }[] = [
		{
			key: 'publicProfileEnabled',
			label: '프로필 공개',
			description: '서버 외부에서도 내전 프로필을 볼 수 있습니다.'
		},
		{
			key: 'showRiotIds',
			label: 'Riot ID 표시',
			description: '경기 기록과 프로필에 연결한 Riot ID를 표시합니다.'
		}
	];
	let saved = $state<PrivacySettings>(untrack(() => ({ ...value })));
	let draft = $state<PrivacySettings>(untrack(() => ({ ...value })));
	let previousValue = untrack(() => ({ ...value }));
	let pending = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	const dirty = $derived(!sameSettings(draft, saved));

	function sameSettings(first: PrivacySettings, second: PrivacySettings) {
		return first.publicProfileEnabled === second.publicProfileEnabled && first.showRiotIds === second.showRiotIds;
	}

	$effect(() => {
		const incoming = { ...value };
		if (sameSettings(incoming, previousValue)) return;
		previousValue = incoming;

		untrack(() => {
			// 저장 응답을 우선하고, 외부 갱신이 작성 중인 초안을 덮어쓰지 않도록 한다.
			if (pending || sameSettings(incoming, saved)) return;
			const hadChanges = !sameSettings(draft, saved);
			saved = { ...incoming };
			if (!hadChanges) draft = { ...incoming };
			clearFeedback();
		});
	});

	function clearFeedback() {
		errorMessage = '';
		successMessage = '';
	}

	function changeSetting(key: keyof PrivacySettings, checked: boolean) {
		if (pending) return;
		draft = { ...draft, [key]: checked };
		clearFeedback();
	}

	function resetChanges() {
		if (pending) return;
		draft = { ...saved };
		clearFeedback();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending || !dirty) return;

		pending = true;
		clearFeedback();
		try {
			const result = await onsave({ ...draft });
			saved = { ...result };
			draft = { ...result };
			successMessage = '공개 범위를 저장했습니다.';
		} catch {
			errorMessage = '공개 범위를 저장하지 못했습니다. 다시 시도해 주세요.';
		} finally {
			pending = false;
		}
	}
</script>

<section class="space-y-6" aria-labelledby={`${id}-heading`}>
	<h2 id={`${id}-heading`} class="text-xl font-semibold">공개 범위</h2>

	<form class="space-y-6" onsubmit={submit} aria-labelledby={`${id}-heading`} aria-busy={pending}>
		<div class="space-y-5">
			{#each fields as field (field.key)}
				<div>
					<label for={`${id}-${field.key}`} class="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
						<input
							id={`${id}-${field.key}`}
							type="checkbox"
							checked={draft[field.key]}
							disabled={pending}
							aria-describedby={`${id}-${field.key}-description`}
							onchange={(event) => changeSetting(field.key, event.currentTarget.checked)}
							class="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60 dark:accent-dark dark:focus-visible:outline-dark"
						/>
						<span>{field.label}</span>
					</label>
					<p id={`${id}-${field.key}-description`} class="pl-8 text-sm leading-6 opacity-70">
						{field.description}
					</p>
				</div>
			{/each}
		</div>

		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-h-6 flex-1 text-sm leading-6">
				{#if errorMessage}
					<p role="alert" class="text-error dark:text-text-dark">{errorMessage}</p>
				{:else}
					<p role="status" aria-live="polite">{successMessage}</p>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				<Button
					type="button"
					fill="line"
					size="md"
					heightOut="0"
					disabled={!dirty || pending}
					onclick={resetChanges}
					injClass="app-button"
				>
					변경 취소
				</Button>
				<Button
					type="submit"
					size="md"
					heightOut="0"
					disabled={!dirty || pending}
					disabledLoading={true}
					loading={pending ? { type: '1_0', width: '4', height: '4', inverse: true } : null}
					injClass="app-button"
				>
					{pending ? '저장 중' : '공개 범위 저장'}
				</Button>
			</div>
		</div>
	</form>
</section>
