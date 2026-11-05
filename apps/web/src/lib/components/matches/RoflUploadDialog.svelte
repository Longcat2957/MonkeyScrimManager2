<script lang="ts">
    import { Button, ImageList, Popup, Radio } from 'stdf';
    import type { ImageListItemProps } from 'stdf';
    import { deserialize } from '$app/forms';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type Props = {
        open: boolean;
        // 남은 세트 수만큼만 고를 수 있다.
        max: number;
        context?: { expectedRevision: number; expectedGameNumber: number; lineupId: string };
        teams?: { slot: 'a' | 'b'; name: string }[];
        // 하나라도 기록되면 닫을 때 마지막으로 기록된 세트 번호를 넘긴다.
        onrecorded: (order: number | null) => void;
    };

    let { open = $bindable(false), max, context, teams = [], onrecorded }: Props = $props();

    let files = $state<ImageListItemProps[]>([]);
    let list = $state<ImageList>();
    let picker = $state<HTMLInputElement>();
    let uploading = $state(false);
    let selectionError = $state('');
    let refreshRequired = $state(false);
    let uploadContext = $state<Props['context']>();
    let blueTeamSlot = $state('');
    let popupPosition = $state<'center' | 'bottom'>('bottom');
    let wasOpen = false;
    let lastOrder: number | null = null;
    let touched = false;
    const waiting = $derived(files.filter((item) => item.status !== 'success'));
    // 실제 등록은 한 파일을 전체 폭으로 표시하고, 개발 샘플의 다중 선택만 3열로 표시한다.
    const empty = $derived(files.length === 0);

    $effect(() => {
        // 열린 상태에서 전환 종류를 바꾸면 STDF가 이전·새 입력을 동시에 렌더링하므로 위치를 유지한다.
        if (!open) popupPosition = desktop.current ? 'center' : 'bottom';
    });

    $effect(() => {
        // 입력창을 연 뒤 다른 운영자가 라인업을 바꿔도 원래 확인한 세트와 버전으로만 요청한다.
        if (open && !wasOpen) uploadContext = context ? { ...context } : undefined;
        wasOpen = open;
    });

    async function send(item: ImageListItemProps) {
        if (!item.file) return false;
        item.status = 'uploading';
        item.message = '';
        const body = new FormData();
        body.set('file', item.file);
        if (uploadContext) {
            for (const [key, value] of Object.entries(uploadContext)) body.set(key, String(value));
            body.set('blueTeamSlot', blueTeamSlot);
        }
        try {
            const response = await fetch('?/upload', {
                method: 'POST',
                body,
                headers: { 'x-sveltekit-action': 'true' }
            });
            const result = deserialize(await response.text());
            if (result.type === 'success') {
                lastOrder = Number(result.data?.order);
                item.status = 'success';
                item.message = `${lastOrder}세트로 기록했어요`;
            } else {
                item.status = 'error';
                item.message =
                    result.type === 'failure' && typeof result.data?.message === 'string'
                        ? result.data.message
                        : '기록하지 못했어요';
                if (result.type === 'failure' && result.status === 409) refreshRequired = true;
            }
        } catch {
            // 응답을 받지 못하면 기록 여부를 단정하지 않는다. 닫을 때 다시 불러와 실제 반영을 확인한다.
            item.status = 'error';
            item.message = '기록 여부를 확인하지 못했어요';
            refreshRequired = true;
        }
        touched = true;
        return item.status === 'success';
    }

    async function upload() {
        uploading = true;
        // 세트 순서가 섞이지 않도록 파일마다 차례로 보낸다.
        for (const item of waiting) {
            if (!(await send(item))) break;
        }
        uploading = false;
    }

    function remove(item: ImageListItemProps) {
        if (uploading) return;
        if (item.url) URL.revokeObjectURL(item.url);
        files = files.filter((file) => file.id !== item.id);
        selectionError = '';
        blueTeamSlot = '';
    }

    function close() {
        if (uploading) return;
        open = false;
        if (touched) onrecorded(lastOrder);
        for (const item of files) if (item.url) URL.revokeObjectURL(item.url);
        files = [];
        lastOrder = null;
        touched = false;
        refreshRequired = false;
        selectionError = '';
        blueTeamSlot = '';
    }
</script>

<div {@attach overlay({ open, label: 'ROFL 업로드', onclose: close })}>
    <Popup
        bind:visible={open}
        position={popupPosition}
        size={0}
        maskClosable={false}
        onclickMask={close}
        transparent
    >
        <div
            class="mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-(--radius-box) bg-bg-surface lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
        >
            <header class="border-b border-border px-5 py-3">
                <h2 class="text-base font-semibold">ROFL 업로드</h2>
            </header>
            <div class="flex flex-col gap-3 overflow-y-auto p-5">
                {#if uploadContext}<p class="text-sm">{uploadContext.expectedGameNumber}세트 결과</p>{/if}
                {#if uploadContext}
                    <fieldset disabled={uploading}>
                        <legend class="mb-2 text-sm font-semibold">이 세트의 블루 팀</legend>
                        <Radio
                            data={teams.map((team) => ({ name: team.slot, label: team.name }))}
                            bind:value={blueTeamSlot}
                        />
                    </fieldset>
                {/if}
                <ImageList
                    bind:value={files}
                    accept=".rofl"
                    multiple={max > 1}
                    {max}
                    maxSize={64}
                    columns={3}
                    injClass={empty || max === 1 ? 'grid-cols-1!' : ''}
                    aspectRatio={empty ? [3, 1] : max === 1 ? [2, 1] : [1, 1]}
                    radius="md"
                    previewable={false}
                    disabled={uploading || refreshRequired}
                    onexceed={() => (selectionError = `파일은 ${max}개까지 선택할 수 있어요`)}
                    onoversized={() => (selectionError = '64MB 이하의 파일을 골라 주세요')}
                    onclickUpload={() => picker?.click()}
                    bind:this={list}
                >
                    {#snippet uploadChild()}
                        <span
                            class="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs font-semibold"
                        >
                            <span aria-hidden="true" class="text-xl leading-none">+</span>ROFL 선택
                            {#if empty}<span class="font-normal opacity-60">최대 {max}개 · 파일당 64MB</span
                                >{/if}
                        </span>
                    {/snippet}
                    {#snippet itemChild(item)}
                        <div
                            class="flex h-full flex-col justify-between gap-2 overflow-y-auto bg-bg-highlight p-3 text-left text-sm dark:bg-bg-highlight-dark"
                        >
                            <span class="line-clamp-2 font-semibold break-all"
                                >{item.file?.name ?? item.id}</span
                            >
                            <span class="opacity-60 tabular-nums"
                                >{item.file ? `${(item.file.size / 1024 / 1024).toFixed(1)}MB` : ''}</span
                            >
                            <span
                                aria-live="polite"
                                class={item.status === 'error'
                                    ? 'text-error'
                                    : item.status === 'success'
                                      ? 'text-success'
                                      : ''}
                            >
                                {item.status === 'uploading' ? '업로드 중' : item.message || '등록 대기'}
                            </span>
                            {#if item.status !== 'success'}
                                <Button
                                    fill="text"
                                    size="auto"
                                    heightOut="0"
                                    heightIn="2"
                                    disabled={uploading}
                                    onclick={() => remove(item)}
                                    ><span class="sr-only">{item.file?.name} </span>선택 해제</Button
                                >
                            {/if}
                        </div>
                    {/snippet}
                </ImageList>
                <!-- STDF ImageList는 파일 입력을 그리지 않으므로 숨긴 입력으로 고른 파일을 넘긴다. -->
                <input
                    bind:this={picker}
                    type="file"
                    accept=".rofl"
                    multiple={max > 1}
                    hidden
                    onchange={(event) => {
                        selectionError = '';
                        list?.addFiles([...(event.currentTarget.files ?? [])]);
                        event.currentTarget.value = '';
                    }}
                />
                {#if selectionError}<p role="alert" class="text-sm text-error">{selectionError}</p>{/if}
                {#if refreshRequired}<p role="alert" class="text-sm">
                        닫으면 현재 경기 상태를 다시 확인해요.
                    </p>{/if}
            </div>
            <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Button
                    fill="text"
                    size="auto"
                    heightOut="0"
                    heightIn="2"
                    injClass="px-4 text-sm"
                    disabled={uploading}
                    onclick={close}>닫기</Button
                >
                <Button
                    size="auto"
                    heightOut="0"
                    heightIn="2"
                    injClass="px-5 text-sm"
                    disabled={!waiting.length || refreshRequired || Boolean(uploadContext && !blueTeamSlot)}
                    loading={uploading ? {} : null}
                    onclick={upload}>업로드</Button
                >
            </footer>
        </div>
    </Popup>
</div>
