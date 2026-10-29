<script lang="ts">
	import { tick } from 'svelte';
	import { Button, Input } from 'stdf';
	import TaskDialog from '#lib/components/common/TaskDialog.svelte';
	import type { RiotAccount } from '#lib/features/me/types.ts';

	interface Props {
		onlookup: (gameName: string, tagLine: string) => Promise<RiotAccount>;
		onlink: (account: RiotAccount) => Promise<void>;
		onclose: () => void;
	}

	let { onlookup, onlink, onclose }: Props = $props();
	let form: HTMLFormElement | undefined = $state();
	let gameName = $state('');
	let tagLine = $state('');
	let nameError = $state('');
	let tagError = $state('');
	let result = $state<RiotAccount | null>(null);
	let errorMessage = $state('');
	let pending = $state<'lookup' | 'link' | null>(null);
	let discard = $state(false);
	let composing = false;
	let active = true;

	$effect(() => () => { active = false; });

	function changeInput() {
		result = null;
		errorMessage = '';
		nameError = '';
		tagError = '';
	}

	function requestClose() {
		if (pending) return;
		if (discard) {
			discard = false;
			void tick().then(() => form?.querySelector('input')?.focus());
		} else if (gameName || tagLine) {
			discard = true;
			void tick().then(() => form?.querySelector('button')?.focus());
		} else {
			onclose();
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending || composing) return;

		gameName = gameName.trim();
		tagLine = tagLine.trim().replace(/^#/, '');
		nameError = !gameName ? 'Riot ID 이름을 입력해 주세요.' : gameName.includes('#') ? '태그는 태그 입력란에 적어 주세요.' : '';
		tagError = !tagLine ? '태그를 입력해 주세요.' : tagLine.includes('#') ? '태그에 #을 넣지 말아 주세요.' : '';
		if (nameError || tagError) {
			await tick();
			form?.querySelectorAll('input')[nameError ? 0 : 1]?.focus();
			return;
		}

		errorMessage = '';
		pending = result ? 'link' : 'lookup';
		try {
			if (result) {
				await onlink(result);
				if (active) onclose();
			} else {
				const account = await onlookup(gameName, tagLine);
				if (active) result = account;
			}
		} catch (error) {
			if (active) errorMessage = error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
		} finally {
			if (active) pending = null;
		}
	}
</script>

<form
	bind:this={form}
	onsubmit={submit}
	oncompositionstart={() => (composing = true)}
	oncompositionend={() => (composing = false)}
	aria-busy={pending !== null}
>
	<TaskDialog open title={discard ? '작성을 취소할까요?' : 'Riot 계정 연결'} onclose={requestClose} closeDisabled={pending !== null}>
		{#if discard}
			<p class="text-sm leading-7">입력한 Riot ID는 저장되지 않습니다.</p>
		{:else}
			<div class="space-y-5">
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="min-w-0 sm:col-span-2">
						<Input title="Riot ID 이름" placeholder="게임에서 사용하는 이름" bind:value={gameName} onchange={changeInput} disabled={pending !== null} maxlength={100} state={nameError ? 'error' : 'theme'}>
							{#snippet tipChild()}
								{#if nameError}<span role="alert">{nameError}</span>{/if}
							{/snippet}
						</Input>
					</div>
					<div class="min-w-0">
						<Input title="태그" placeholder="KR1" bind:value={tagLine} onchange={changeInput} disabled={pending !== null} maxlength={100} state={tagError ? 'error' : 'theme'}>
							{#snippet tipChild()}
								{#if tagError}<span role="alert">{tagError}</span>{/if}
							{/snippet}
						</Input>
					</div>
				</div>

				{#if result}
					<div class="border-t border-border pt-4" role="status">
						<p class="text-xs font-medium opacity-60">조회한 계정</p>
						<p class="mt-2 break-words font-semibold">{result.gameName}<span class="font-normal opacity-60">#{result.tagLine}</span></p>
						<p class="mt-1 text-sm opacity-70">{result.platform}</p>
					</div>
				{/if}
				{#if errorMessage}<p class="text-sm leading-6 text-error dark:text-text-dark" role="alert">{errorMessage}</p>{/if}
			</div>
		{/if}

		{#snippet footer()}
			<div class="flex flex-wrap justify-end gap-2">
				{#if discard}
					<Button fill="line" size="md" heightOut="0" injClass="app-button" onclick={requestClose}>계속 작성</Button>
					<Button size="md" heightOut="0" injClass="app-button" onclick={onclose}>작성 취소</Button>
				{:else}
					<Button fill="line" size="md" heightOut="0" injClass="app-button" disabled={pending !== null} onclick={requestClose}>닫기</Button>
					<Button
						type="submit"
						size="md"
						heightOut="0"
						injClass="app-button"
						disabled={pending !== null}
						loading={pending ? { width: '4', height: '4', inverse: true } : null}
					>
						{pending === 'lookup' ? '조회 중' : pending === 'link' ? '연결 중' : result ? '이 계정 연결' : '계정 조회'}
					</Button>
				{/if}
			</div>
		{/snippet}
	</TaskDialog>
</form>
