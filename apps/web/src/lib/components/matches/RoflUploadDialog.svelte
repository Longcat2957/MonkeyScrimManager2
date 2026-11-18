<script lang="ts">
    import { deserialize } from '$app/forms';
    import { untrack } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import CheckboxField from '#lib/components/common/CheckboxField.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import RadioGroup from '#lib/components/common/RadioGroup.svelte';

    type Props = {
        open: boolean;
        context: {
            max: number;
            expectedRevision: number;
            expectedGameNumber: number;
            lineupId?: string;
            plannedBlueTeamSlot: 'a' | 'b' | null;
            teamA: string;
            teamB: string;
        };
        // 하나라도 기록되면 닫을 때 마지막으로 기록된 세트 번호를 넘긴다.
        onrecorded: (order: number | null) => void;
    };

    type SideChoice = { slot: string; confirmed: boolean };
    type UploadFile = {
        id: number;
        file: File;
        side: SideChoice;
        status: 'ready' | 'uploading' | 'success' | 'error';
        message: string;
    };

    let { open = $bindable(false), context, onrecorded }: Props = $props();

    const MAX_SIZE = 64 * 1024 * 1024;

    let files = $state<UploadFile[]>([]);
    let picker = $state<HTMLInputElement>();
    let nextId = 0;
    let uploading = $state(false);
    let selectionError = $state('');
    let refreshRequired = $state(false);
    let uploadContext = $state<Props['context']>();
    let requestPath = '';
    let firstSide = $state<SideChoice>({ slot: '', confirmed: false });
    let completed = $state(false);
    let lastOrder: number | null = null;
    let touched = false;
    const waiting = $derived(files.filter((item) => item.status !== 'success'));
    const max = $derived(uploadContext?.max ?? 0);
    const options = $derived([
        { value: 'a', label: uploadContext?.teamA ?? '' },
        { value: 'b', label: uploadContext?.teamB ?? '' }
    ]);
    const canUpload = $derived(
        !refreshRequired &&
            !completed &&
            waiting.length > 0 &&
            waiting.every(({ side }) => side.slot && side.confirmed)
    );

    $effect(() => {
        if (!open) return;
        // 열린 입력은 팀·세트·버전을 함께 보존한다. 다른 운영자의 수정은 서버에서 충돌로 처리한다.
        untrack(() => {
            uploadContext = { ...context };
            requestPath = `${location.pathname}?/upload`;
            firstSide = { slot: context.plannedBlueTeamSlot ?? '', confirmed: false };
        });
    });

    function addFiles(selected: File[]) {
        selectionError = '';
        if (!files.length) firstSide.confirmed = false;
        const room = Math.max(0, max - files.length);
        if (selected.length > room) selectionError = `파일은 ${max}개까지 선택할 수 있어요`;
        const accepted = selected.slice(0, room);
        if (accepted.some((file) => file.size > MAX_SIZE)) selectionError = '64MB 이하의 파일을 골라 주세요';
        files = [
            ...files,
            ...accepted
                .filter((file) => file.size <= MAX_SIZE)
                .map((file, index) => ({
                    id: ++nextId,
                    file,
                    status: 'ready' as const,
                    message: '',
                    side: files.length === 0 && index === 0 ? firstSide : { slot: '', confirmed: false }
                }))
        ];
    }

    async function send(item: UploadFile) {
        if (!uploadContext) return false;
        item.status = 'uploading';
        item.message = '';
        const body = new FormData();
        body.set('file', item.file);
        body.set('expectedRevision', String(uploadContext.expectedRevision));
        body.set('expectedGameNumber', String(uploadContext.expectedGameNumber + files.indexOf(item)));
        if (uploadContext.lineupId) body.set('lineupId', uploadContext.lineupId);
        body.set('blueTeamSlot', item.side.slot);
        body.set('blueTeamConfirmed', String(item.side.confirmed));
        try {
            const response = await fetch(requestPath, {
                method: 'POST',
                body,
                headers: { 'x-sveltekit-action': 'true' }
            });
            const result = deserialize(await response.text());
            if (result.type === 'success') {
                lastOrder = Number(result.data?.order);
                item.status = 'success';
                item.message = `${lastOrder}세트로 기록했어요`;
                if (typeof result.data?.revision === 'number')
                    uploadContext.expectedRevision = result.data.revision;
                completed = result.data?.completed === true;
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
        if (uploading || !canUpload) return;
        uploading = true;
        try {
            // 세트 순서가 섞이지 않도록 파일마다 차례로 보낸다.
            for (const item of waiting) {
                if (!(await send(item)) || completed) break;
            }
        } finally {
            uploading = false;
        }
    }

    function remove(item: UploadFile) {
        if (uploading) return;
        const index = files.indexOf(item);
        files = files.filter((file) => file.id !== item.id);
        // 삭제 뒤 세트 번호가 당겨지는 파일은 바뀐 순서로 진영을 다시 확인한다.
        for (const file of files.slice(index)) file.side.confirmed = false;
        if (index === 0)
            firstSide = files[0]?.side ?? {
                slot: uploadContext?.plannedBlueTeamSlot ?? '',
                confirmed: false
            };
        selectionError = '';
    }

    function close() {
        if (uploading) return;
        open = false;
        if (touched) onrecorded(lastOrder);
        files = [];
        lastOrder = null;
        touched = false;
        refreshRequired = false;
        selectionError = '';
        completed = false;
    }
</script>

{#snippet sides(side: SideChoice, index: number, locked: boolean)}
    <fieldset disabled={uploading || refreshRequired || locked || completed} class="grid min-w-0 gap-2">
        <RadioGroup
            legend={index === 0
                ? '이 세트의 블루 팀'
                : `${(uploadContext?.expectedGameNumber ?? 0) + index}세트의 블루 팀`}
            name={`blueTeamSlot-${index}`}
            bind:value={
                () => side.slot,
                (value) => {
                    side.slot = value;
                    side.confirmed = false;
                }
            }
            {options}
        />
        {#if side.slot && uploadContext}
            <div class="rounded-(--radius-form) border border-line bg-surface-2 px-3 py-2">
                <CheckboxField
                    label={`블루 ${side.slot === 'a' ? uploadContext.teamA : uploadContext.teamB} · 레드 ${side.slot === 'a' ? uploadContext.teamB : uploadContext.teamA}이 실제 진영과 맞아요`}
                    bind:checked={side.confirmed}
                />
            </div>
        {/if}
    </fieldset>
{/snippet}

<Dialog {open} title="ROFL 업로드" dismissible={!uploading} onclose={close}>
    <div class="flex flex-col gap-3">
        {#if uploadContext}
            <h3 class="border-b border-line pb-2 text-base font-bold">
                {uploadContext.expectedGameNumber}세트 결과
            </h3>
            {@render sides(firstSide, 0, files[0]?.status === 'success')}
        {/if}

        <div
            class={[
                'flex flex-wrap items-center gap-x-3 gap-y-1.5',
                uploadContext && 'border-t border-line pt-3'
            ]}
        >
            <Button
                variant="secondary"
                disabled={uploading || refreshRequired || completed || files.length >= max}
                onclick={() => picker?.click()}
            >
                ROFL 선택
            </Button>
            <span class="text-xs text-muted">최대 {max}개 · 파일당 64MB</span>
            <!-- 공용 Button은 파일 대화상자를 열 수 없어 숨긴 입력에 선택을 맡긴다. -->
            <input
                bind:this={picker}
                type="file"
                accept=".rofl"
                multiple={max > 1}
                hidden
                onchange={(event) => {
                    addFiles([...(event.currentTarget.files ?? [])]);
                    event.currentTarget.value = '';
                }}
            />
        </div>

        {#if files.length}
            <ul class="divide-y divide-line border-y border-line">
                {#each files as item, index (item.id)}
                    <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-ui">
                        <span class="flex min-w-0 flex-col">
                            <span class="truncate font-semibold"
                                >{#if max > 1 && uploadContext}{uploadContext.expectedGameNumber + index}세트
                                    ·
                                {/if}{item.file.name}</span
                            >
                            <span
                                aria-live="polite"
                                class={[
                                    'text-xs tabular-nums',
                                    item.status === 'error'
                                        ? 'text-error'
                                        : item.status === 'success'
                                          ? 'text-success'
                                          : 'text-muted'
                                ]}
                            >
                                {(item.file.size / 1024 / 1024).toFixed(1)}MB ·
                                {item.status === 'uploading' ? '업로드 중' : item.message || '등록 대기'}
                            </span>
                        </span>
                        {#if item.status !== 'success'}
                            <Button
                                variant="quiet"
                                size="sm"
                                disabled={uploading}
                                class="shrink-0"
                                onclick={() => remove(item)}
                                ><span class="sr-only">{item.file.name} </span>선택 해제</Button
                            >
                        {/if}
                        {#if index > 0}
                            <div class="w-full">
                                {@render sides(item.side, index, item.status === 'success')}
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}

        {#if selectionError}<p role="alert" class="text-sm text-error">{selectionError}</p>{/if}
        {#if refreshRequired}<p role="alert" class="text-sm">닫으면 현재 경기 상태를 다시 확인해요.</p>{/if}
        {#if completed && waiting.length}<p role="status" class="text-sm">
                경기가 끝나 남은 파일은 기록하지 않았어요.
            </p>{/if}
    </div>

    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <Button variant="primary" disabled={!canUpload} loading={uploading} onclick={upload}
                >업로드</Button
            >
        </div>
    {/snippet}
</Dialog>
