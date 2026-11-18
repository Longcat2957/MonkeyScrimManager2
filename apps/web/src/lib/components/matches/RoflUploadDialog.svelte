<script lang="ts">
    import { deserialize } from '$app/forms';
    import Button from '#lib/components/common/Button.svelte';
    import CheckboxField from '#lib/components/common/CheckboxField.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import RadioGroup from '#lib/components/common/RadioGroup.svelte';

    type Props = {
        open: boolean;
        // 남은 세트 수만큼만 고를 수 있다.
        max: number;
        context?: { expectedRevision: number; expectedGameNumber: number; lineupId: string };
        teams?: { slot: 'a' | 'b'; name: string }[];
        // 하나라도 기록되면 닫을 때 마지막으로 기록된 세트 번호를 넘긴다.
        onrecorded: (order: number | null) => void;
    };

    type UploadFile = {
        id: number;
        file: File;
        status: 'ready' | 'uploading' | 'success' | 'error';
        message: string;
    };

    let { open = $bindable(false), max, context, teams = [], onrecorded }: Props = $props();

    const MAX_SIZE = 64 * 1024 * 1024;

    let files = $state<UploadFile[]>([]);
    let picker = $state<HTMLInputElement>();
    let nextId = 0;
    let uploading = $state(false);
    let selectionError = $state('');
    let refreshRequired = $state(false);
    let uploadContext = $state<Props['context']>();
    let blueTeamSlot = $state('');
    let blueTeamConfirmed = $state(false);
    let previousSlot = '';
    let wasOpen = false;
    let lastOrder: number | null = null;
    let touched = false;
    const waiting = $derived(files.filter((item) => item.status !== 'success'));
    const blueTeam = $derived(teams.find((team) => team.slot === blueTeamSlot));
    const redTeam = $derived(teams.find((team) => team.slot !== blueTeamSlot));
    const options = $derived(teams.map((team) => ({ value: team.slot, label: team.name })));

    $effect(() => {
        // 입력창을 연 뒤 다른 운영자가 라인업을 바꿔도 원래 확인한 세트와 버전으로만 요청한다.
        const currentContext = context ? { ...context } : undefined;
        if (open && !wasOpen) uploadContext = currentContext;
        blueTeamConfirmed = false;
        wasOpen = open;
    });

    $effect(() => {
        // 진영을 바꾸면 이전 확인은 무효다.
        if (blueTeamSlot === previousSlot) return;
        previousSlot = blueTeamSlot;
        blueTeamConfirmed = false;
    });

    function addFiles(selected: File[]) {
        selectionError = '';
        blueTeamConfirmed = false;
        const room = Math.max(0, max - files.length);
        if (selected.length > room) selectionError = `파일은 ${max}개까지 선택할 수 있어요`;
        const accepted = selected.slice(0, room);
        if (accepted.some((file) => file.size > MAX_SIZE)) selectionError = '64MB 이하의 파일을 골라 주세요';
        files = [
            ...files,
            ...accepted
                .filter((file) => file.size <= MAX_SIZE)
                .map((file) => ({ id: ++nextId, file, status: 'ready' as const, message: '' }))
        ];
    }

    async function send(item: UploadFile) {
        item.status = 'uploading';
        item.message = '';
        const body = new FormData();
        body.set('file', item.file);
        if (uploadContext) {
            for (const [key, value] of Object.entries(uploadContext)) body.set(key, String(value));
            body.set('blueTeamSlot', blueTeamSlot);
            body.set('blueTeamConfirmed', String(blueTeamConfirmed));
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
        if (
            uploading ||
            refreshRequired ||
            !waiting.length ||
            (uploadContext && (!blueTeamSlot || !blueTeamConfirmed))
        )
            return;
        uploading = true;
        try {
            // 세트 순서가 섞이지 않도록 파일마다 차례로 보낸다.
            for (const item of waiting) {
                if (!(await send(item))) break;
            }
        } finally {
            uploading = false;
        }
    }

    function remove(item: UploadFile) {
        if (uploading) return;
        files = files.filter((file) => file.id !== item.id);
        selectionError = '';
        blueTeamSlot = '';
        blueTeamConfirmed = false;
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
        blueTeamSlot = '';
        blueTeamConfirmed = false;
    }
</script>

<Dialog {open} title="ROFL 업로드" dismissible={!uploading} onclose={close}>
    <div class="flex flex-col gap-3">
        {#if uploadContext}
            <h3 class="border-b border-line pb-2 text-base font-bold">
                {uploadContext.expectedGameNumber}세트 결과
            </h3>
            <fieldset disabled={uploading} class="min-w-0">
                <RadioGroup
                    legend="이 세트의 블루 팀"
                    name="blueTeamSlot"
                    bind:value={blueTeamSlot}
                    {options}
                />
            </fieldset>
            {#if blueTeam && redTeam}
                <fieldset
                    disabled={uploading || refreshRequired}
                    class="rounded-(--radius-form) border border-line bg-surface-2 px-3 py-2"
                >
                    <legend class="sr-only">진영 확인</legend>
                    <CheckboxField
                        label={`블루 ${blueTeam.name} · 레드 ${redTeam.name}이 실제 진영과 맞아요`}
                        bind:checked={blueTeamConfirmed}
                    />
                </fieldset>
            {/if}
        {/if}

        <div
            class={[
                'flex flex-wrap items-center gap-x-3 gap-y-1.5',
                uploadContext && 'border-t border-line pt-3'
            ]}
        >
            <Button
                variant="secondary"
                disabled={uploading || refreshRequired || files.length >= max}
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
                {#each files as item (item.id)}
                    <li class="flex items-center justify-between gap-2 py-2 text-ui">
                        <span class="flex min-w-0 flex-col">
                            <span class="truncate font-semibold">{item.file.name}</span>
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
                    </li>
                {/each}
            </ul>
        {/if}

        {#if selectionError}<p role="alert" class="text-sm text-error">{selectionError}</p>{/if}
        {#if refreshRequired}<p role="alert" class="text-sm">닫으면 현재 경기 상태를 다시 확인해요.</p>{/if}
    </div>

    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <Button
                variant="primary"
                disabled={!waiting.length ||
                    refreshRequired ||
                    Boolean(uploadContext && (!blueTeamSlot || !blueTeamConfirmed))}
                loading={uploading}
                onclick={upload}>업로드</Button
            >
        </div>
    {/snippet}
</Dialog>
