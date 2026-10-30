<script lang="ts">
	import { Button, Input, Popup } from 'stdf';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '#lib/features/me/riot-id.ts';
	import type { RiotLookup } from '#lib/features/me/types.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let riotId = $state('');
	let error = $state('');
	let pending = $state(false);
	// 조회로 찾은 계정. 값이 있으면 연결 확인 단계를 보여 준다.
	let found = $state<RiotLookup | null>(null);

	function reset() {
		riotId = '';
		error = '';
		found = null;
	}

	function close() {
		if (pending) return;
		open = false;
		reset();
	}

	const submitLookup: SubmitFunction = ({ formData, cancel }) => {
		if (!parseRiotId(riotId)) {
			error = RIOT_ID_FORMAT_ERROR;
			cancel();
			return;
		}
		formData.set('riotId', riotId);
		error = '';
		pending = true;
		return async ({ result }) => {
			pending = false;
			if (result.type === 'success') found = result.data?.lookup as RiotLookup;
			else if (result.type === 'failure') error = String(result.data?.riotIdError ?? '조회하지 못했어요');
			else error = '조회하지 못했어요';
		};
	};

	const submitLink: SubmitFunction = ({ formData }) => {
		formData.set('riotId', riotId);
		error = '';
		pending = true;
		return async ({ result, update }) => {
			pending = false;
			if (result.type === 'success') {
				await update();
				close();
			} else if (result.type === 'failure') {
				error = String(result.data?.riotIdError ?? '연결하지 못했어요');
			} else {
				error = '연결하지 못했어요';
			}
		};
	};
</script>

<div {@attach overlay({ open, label: 'Riot 계정 추가', onclose: close })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} maskClosable={false} transparent>
		<div
			class="mx-auto flex w-full max-w-md flex-col gap-5 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
		>
			<h2 class="text-lg font-semibold">Riot 계정 추가</h2>

			{#if !found}
				<form method="POST" action="?/lookup" class="flex flex-col gap-5" novalidate use:enhance={submitLookup}>
					<Input
						title="Riot ID"
						titlePosition="out"
						placeholder="이름#태그"
						bind:value={riotId}
						state={error ? 'error' : 'theme'}
						tip={error || '게임 클라이언트 프로필에 표시되는 이름과 태그예요'}
						autocomplete={false}
						required
					/>
					<div class="flex justify-end gap-2">
						<Button type="button" fill="lineLight" size="auto" heightOut="0" injClass="px-4" onclick={close}>취소</Button>
						<Button type="submit" size="auto" heightOut="0" injClass="px-4" loading={pending ? {} : null}>조회</Button>
					</div>
				</form>
			{:else}
				<form method="POST" action="?/link" class="flex flex-col gap-5" novalidate use:enhance={submitLink}>
					<div class="flex flex-col gap-1 rounded-(--radius-form) bg-bg-overlay px-4 py-3 dark:bg-bg-overlay-dark">
						<span class="font-semibold break-all">
							{found.gameName}<span class="font-normal opacity-60"> #{found.tagLine}</span>
						</span>
						<span class="text-sm opacity-70">{found.region} 서버</span>
					</div>
					{#if error}
						<p role="alert" class="text-sm text-error">{error}</p>
					{:else}
						<p class="text-sm opacity-80">이 계정을 내 계정으로 연결할까요?</p>
					{/if}
					<div class="flex justify-end gap-2">
						<Button
							type="button"
							fill="lineLight"
							size="auto"
							heightOut="0"
							injClass="px-4"
							disabled={pending}
							onclick={() => ((found = null), (error = ''))}
						>
							다시 입력
						</Button>
						<Button type="submit" size="auto" heightOut="0" injClass="px-4" loading={pending ? {} : null}>연결</Button>
					</div>
				</form>
			{/if}
		</div>
	</Popup>
</div>
