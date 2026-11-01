<script lang="ts">
	import { Button, ImageList, Loading, Popup } from 'stdf';
	import type { ImageListItemProps } from 'stdf';
	import { deserialize } from '$app/forms';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	type Props = {
		open: boolean;
		// 남은 게임 수만큼만 고를 수 있다.
		max: number;
		// 하나라도 기록되면 닫을 때 마지막으로 기록된 게임 번호를 넘긴다.
		onrecorded: (order: number | null) => void;
	};

	let { open = $bindable(false), max, onrecorded }: Props = $props();

	let files = $state<ImageListItemProps[]>([]);
	let list = $state<ImageList>();
	let picker = $state<HTMLInputElement>();
	let uploading = $state(false);
	let lastOrder: number | null = null;
	let touched = false;
	const waiting = $derived(files.filter((item) => item.status !== 'success'));

	async function send(item: ImageListItemProps) {
		if (!item.file) return;
		item.status = 'uploading';
		item.message = '';
		const body = new FormData();
		body.set('file', item.file);
		try {
			const response = await fetch('?/upload', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				lastOrder = Number(result.data?.order);
				item.status = 'success';
				item.message = `${lastOrder}게임으로 기록했어요`;
			} else {
				item.status = 'error';
				item.message = result.type === 'failure' && typeof result.data?.message === 'string' ? result.data.message : '기록하지 못했어요';
			}
		} catch {
			// 응답을 받지 못하면 기록 여부를 단정하지 않는다. 닫을 때 다시 불러와 실제 반영을 확인한다.
			item.status = 'error';
			item.message = '기록 여부를 확인하지 못했어요';
		}
		touched = true;
	}

	async function upload() {
		uploading = true;
		// 게임 순서가 섞이지 않도록 파일마다 차례로 보낸다.
		for (const item of waiting) await send(item);
		uploading = false;
	}

	function close() {
		if (uploading) return;
		open = false;
		if (touched) onrecorded(lastOrder);
		files = [];
		lastOrder = null;
		touched = false;
	}
</script>

<div {@attach overlay({ open, label: 'ROFL 업로드', onclose: close })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} maskClosable={!uploading} transparent>
		<div class="mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-(--radius-box) bg-bg-surface lg:rounded-(--radius-box) dark:bg-bg-surface-dark">
			<header class="border-b border-border px-5 py-3">
				<h2 class="text-base font-semibold">ROFL 업로드</h2>
			</header>
			<div class="flex flex-col gap-3 overflow-y-auto p-5">
				<ImageList
					bind:value={files}
					accept=".rofl"
					multiple
					{max}
					maxSize={64}
					columns={3}
					radius="md"
					previewable={false}
					disabled={uploading}
					onretry={send}
					onclickUpload={() => picker?.click()}
					bind:this={list}
				>
					{#snippet uploadChild()}
						<span class="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs font-semibold">
							<span aria-hidden="true" class="text-xl leading-none">+</span>ROFL 선택
						</span>
					{/snippet}
					{#snippet itemChild(item)}
						<span class="flex h-full flex-col justify-between gap-1 bg-bg-highlight p-2 text-left text-xs dark:bg-bg-highlight-dark">
							<span class="line-clamp-2 font-semibold break-all">{item.file?.name ?? item.id}</span>
							<span class="opacity-60 tabular-nums">{item.file ? `${(item.file.size / 1024 / 1024).toFixed(1)}MB` : ''}</span>
						</span>
					{/snippet}
					{#snippet statusChild(item)}
						<span class={['flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs font-semibold text-white', item.status === 'success' ? 'bg-success/85' : item.status === 'error' ? 'bg-error/85' : 'bg-black/60']}>
							{#if item.status === 'uploading'}
								<Loading type="1_0" height="6" width="6" />업로드 중
							{:else}
								<span aria-hidden="true">{item.status === 'success' ? '✓' : '✕'}</span>{item.message}
							{/if}
						</span>
					{/snippet}
				</ImageList>
				<!-- STDF ImageList는 파일 입력을 그리지 않으므로 숨긴 입력으로 고른 파일을 넘긴다. -->
				<input
					bind:this={picker}
					type="file"
					accept=".rofl"
					multiple
					hidden
					onchange={(event) => {
						list?.addFiles([...(event.currentTarget.files ?? [])]);
						event.currentTarget.value = '';
					}}
				/>
				<!-- 파일별 결과를 보조기기에 알린다. -->
				<ul class="sr-only" aria-live="polite">
					{#each files as item (item.id)}{#if item.message}<li>{item.file?.name}: {item.message}</li>{/if}{/each}
				</ul>
			</div>
			<footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
				<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-4 text-sm" disabled={uploading} onclick={close}>닫기</Button>
				<Button size="auto" heightOut="0" heightIn="2" injClass="px-5 text-sm" disabled={!waiting.length} loading={uploading ? {} : null} onclick={upload}>업로드</Button>
			</footer>
		</div>
	</Popup>
</div>
