<script lang="ts">
    import type { ActionResult } from '$app/forms';
    import { tick, untrack } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import CheckboxField from '#lib/components/common/CheckboxField.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import RadioGroup from '#lib/components/common/RadioGroup.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import type { RoflPreview } from '#lib/features/matches/rofl-preview.ts';
    import { localActions, submitAction } from '#lib/ui/actions.ts';

    type Props = {
        open: boolean;
        context: {
            max: number;
            expectedRevision: number;
            expectedGameNumber: number;
            lineupId?: string;
            plannedBlueTeamSlot: 'a' | 'b' | null;
            scrimTitle: string;
            teamA: string;
            teamB: string;
        };
        // 하나라도 기록되면 닫을 때 마지막으로 기록된 세트 번호를 넘긴다.
        onrecorded: (order: number | null) => void;
        // 열 때 미리 담아 둘 파일. 소개 화면 체험의 샘플 리플레이에만 쓴다.
        initialFiles?: File[];
    };

    type SideChoice = { slot: string; confirmed: boolean };
    type UploadFile = {
        id: number;
        file: File;
        side: SideChoice;
        status: 'ready' | 'success' | 'error';
        message: string;
    };

    let { open = $bindable(false), context, onrecorded, initialFiles = [] }: Props = $props();
    const local = localActions();

    const MAX_SIZE = 64 * 1024 * 1024;

    let files = $state<UploadFile[]>([]);
    let picker = $state<HTMLInputElement>();
    let nextId = 0;
    let busy = $state<'preview' | 'upload' | null>(null);
    let preview = $state<RoflPreview | null>(null);
    let heading = $state<HTMLHeadingElement>();
    let selectionError = $state('');
    let refreshRequired = $state(false);
    let uploadContext = $state<Props['context']>();
    let requestPath = '';
    let firstSide = $state<SideChoice>({ slot: '', confirmed: false });
    let completed = $state(false);
    let lastOrder = $state<number | null>(null);
    let confirmedFileId = $state<number | null>(null);
    const pending = $derived(files.find((item) => item.status !== 'success'));
    const max = $derived(uploadContext?.max ?? 0);
    const options = $derived([
        { value: 'a', label: uploadContext?.teamA ?? '' },
        { value: 'b', label: uploadContext?.teamB ?? '' }
    ]);
    const ready = $derived(!refreshRequired && !completed && pending?.side.slot && pending.side.confirmed);

    $effect(() => {
        if (!open) return;
        // 열린 입력은 팀·세트·버전을 함께 보존한다. 다른 운영자의 수정은 서버에서 충돌로 처리한다.
        untrack(() => {
            uploadContext = { ...context };
            requestPath = location.pathname;
            firstSide = { slot: context.plannedBlueTeamSlot ?? '', confirmed: false };
            if (!files.length && initialFiles.length) addFiles(initialFiles);
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

    async function submit(action: 'preview' | 'upload') {
        const item = pending;
        if (busy || !ready || !item || !uploadContext || (action === 'upload') !== Boolean(preview)) return;
        busy = action;
        item.status = 'ready';
        item.message = '';
        const body = new FormData();
        body.set('file', item.file);
        body.set('expectedRevision', String(uploadContext.expectedRevision));
        body.set('expectedGameNumber', String(uploadContext.expectedGameNumber + files.indexOf(item)));
        if (uploadContext.lineupId) body.set('lineupId', uploadContext.lineupId);
        body.set('blueTeamSlot', item.side.slot);
        body.set('blueTeamConfirmed', String(item.side.confirmed));
        if (action === 'upload' && preview) body.set('previewDigest', preview.digest);
        try {
            const result = (await submitAction(local, action, body, requestPath)) as ActionResult<
                {
                    preview?: RoflPreview;
                    order?: number;
                    revision?: number;
                    completed?: boolean;
                },
                { message?: string }
            >;
            if (result.type === 'failure') {
                item.status = 'error';
                item.message =
                    typeof result.data?.message === 'string'
                        ? result.data.message
                        : action === 'preview'
                          ? '미리보기를 불러오지 못했어요'
                          : '등록 요청이 거절됐어요';
                refreshRequired = result.status === 409;
                if (refreshRequired) preview = null;
            } else if (result.type === 'success' && action === 'preview' && result.data?.preview) {
                // 미리보기에서 목록으로 돌아와도 앞서 기록한 파일을 다시 강조하지 않는다.
                confirmedFileId = null;
                preview = result.data.preview;
            } else if (
                result.type === 'success' &&
                action === 'upload' &&
                typeof result.data?.order === 'number'
            ) {
                lastOrder = result.data.order;
                item.status = 'success';
                confirmedFileId = item.id;
                item.message = `${lastOrder}세트로 기록했어요`;
                if (typeof result.data.revision === 'number')
                    uploadContext.expectedRevision = result.data.revision;
                completed = result.data.completed === true;
                preview = null;
            } else {
                throw new Error();
            }
        } catch {
            // 미리보기에는 쓰기가 없지만 등록 응답이 유실되면 닫을 때 실제 반영 여부를 확인한다.
            item.status = 'error';
            item.message =
                action === 'preview'
                    ? '미리보기를 불러오지 못했어요. 다시 시도해 주세요.'
                    : '기록 여부를 확인하지 못했어요';
            refreshRequired = action === 'upload';
            preview = null;
        } finally {
            busy = null;
        }
        if (action === 'upload' && item.status === 'success' && ready) {
            // 앞 세트를 기록한 뒤의 버전으로 다음 파일만 읽는다. 등록은 매번 별도 조작이다.
            await submit('preview');
        } else {
            await tick();
            heading?.focus();
        }
    }

    async function edit() {
        preview = null;
        if (pending) {
            pending.status = 'ready';
            pending.message = '';
        }
        await tick();
        heading?.focus();
    }

    function remove(item: UploadFile) {
        if (busy || refreshRequired || completed) return;
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
        if (busy) return;
        open = false;
        if (lastOrder !== null || refreshRequired) onrecorded(lastOrder);
        files = [];
        lastOrder = null;
        confirmedFileId = null;
        preview = null;
        refreshRequired = false;
        selectionError = '';
        completed = false;
    }
</script>

{#snippet sides(side: SideChoice, index: number, locked: boolean)}
    <fieldset disabled={Boolean(busy) || refreshRequired || locked || completed} class="grid min-w-0 gap-2">
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

{#snippet actions()}
    <div class="flex justify-end gap-2">
        {#if preview}
            <Button variant="secondary" disabled={Boolean(busy)} onclick={edit}>수정</Button>
            <Button
                variant="primary"
                loading={busy === 'upload'}
                onclick={(event) => event.detail < 2 && submit('upload')}>이대로 등록</Button
            >
        {:else}
            <Button
                variant="primary"
                disabled={!ready}
                loading={busy === 'preview'}
                onclick={() => submit('preview')}
            >
                미리보기
            </Button>
        {/if}
    </div>
{/snippet}

<Dialog
    {open}
    title="ROFL 업로드"
    dismissible={!busy}
    onclose={close}
    footer={preview || (!completed && !refreshRequired && (pending || !files.length)) ? actions : undefined}
>
    <div class={preview ? 'grid min-w-0 gap-4' : 'flex flex-col gap-3'}>
        {#if preview && pending && uploadContext}
            <header>
                <h3 bind:this={heading} tabindex="-1" class="text-base font-bold">등록값 미리보기</h3>
                <p class="mt-1 text-ui wrap-anywhere">
                    {uploadContext.scrimTitle} · {uploadContext.teamA} vs {uploadContext.teamB} · {preview.order}세트
                </p>
                <p class="text-xs wrap-anywhere text-muted">{pending.file.name}</p>
            </header>
            {#if lastOrder !== null}
                <p role="status" class="text-xs text-success">{lastOrder}세트까지 기록했어요</p>
            {/if}
            {#if preview.players.some((player) => player.newConnection)}
                <p class="text-ui text-ink-2">
                    새 연결로 표시된 Riot 계정이 해당 출전자의 계정인지 확인해 주세요.
                </p>
            {/if}
            {#each ['blue', 'red'] as side (side)}
                {@const blue = side === 'blue'}
                {@const teamA = blue === (preview.blueTeamSlot === 'a')}
                <table class="w-full table-fixed text-left text-ui">
                    <caption class="border-b border-line-strong pb-1.5 text-left">
                        <span class={['text-xs font-bold', blue ? 'text-team-blue' : 'text-team-red']}
                            >{blue ? '블루' : '레드'}</span
                        >
                        <strong class="mx-1 wrap-anywhere"
                            >{teamA ? uploadContext.teamA : uploadContext.teamB}</strong
                        >
                        <span
                            class={[
                                'text-xs',
                                preview.winner === side ? 'font-bold text-success' : 'text-muted'
                            ]}>{preview.winner === side ? '승리' : '패배'}</span
                        >
                    </caption>
                    <thead class="text-xs text-ink-2">
                        <tr>
                            <th scope="col" class="w-[45%] py-2">출전자 / Riot 계정</th>
                            <th scope="col" class="w-[30%]">포지션 / 챔피언</th>
                            <th scope="col" class="text-right">K/D/A</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-line border-y border-line">
                        {#each preview.players.filter((player) => player.side === side) as player, index (index)}
                            <tr>
                                <td class="py-1.5 pr-2 wrap-anywhere">
                                    <strong>{player.displayName}</strong>
                                    <span class="block text-xs text-ink-2">{player.riotId}</span>
                                    {#if player.newConnection}<span class="text-xs font-semibold text-warning"
                                            >새 연결</span
                                        >{/if}
                                </td>
                                <td class="pr-2 wrap-anywhere">
                                    <span class="block text-xs text-ink-2"
                                        >{POSITIONS.find((role) => role.key === player.position)?.text ??
                                            '—'}</span
                                    >
                                    {player.champion}
                                </td>
                                <td class="text-right tabular-nums"
                                    >{player.kills ?? '—'} / {player.deaths ?? '—'} / {player.assists ??
                                        '—'}</td
                                >
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/each}
            {#if pending.message}<p role="alert" class="text-ui text-error">{pending.message}</p>{/if}
        {:else if uploadContext}
            <h3
                bind:this={heading}
                tabindex="-1"
                class="border-b border-line pb-2 text-base font-bold wrap-anywhere"
            >
                {uploadContext.scrimTitle} · {uploadContext.teamA} vs {uploadContext.teamB}
            </h3>
            <p class="text-ui font-semibold">{uploadContext.expectedGameNumber}세트 결과</p>
            {@render sides(firstSide, 0, files[0]?.status === 'success')}
        {/if}

        {#if !preview}
            <div
                class={[
                    'flex flex-wrap items-center gap-x-3 gap-y-1.5',
                    uploadContext && 'border-t border-line pt-3'
                ]}
            >
                <Button
                    variant="secondary"
                    disabled={Boolean(busy) || refreshRequired || completed || files.length >= max}
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
                    aria-label="ROFL 파일"
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
                                <span class="font-semibold wrap-anywhere"
                                    >{#if max > 1 && uploadContext}{uploadContext.expectedGameNumber +
                                            index}세트 ·
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
                                    {Math.ceil(item.file.size / 1024)}KB ·
                                    <span class:workflow-change={confirmedFileId === item.id}>
                                        {busy && item === pending
                                            ? '미리보기 불러오는 중'
                                            : item.message || '등록 대기'}
                                    </span>
                                </span>
                            </span>
                            {#if item.status !== 'success'}
                                <Button
                                    variant="quiet"
                                    size="sm"
                                    disabled={Boolean(busy) || refreshRequired || completed}
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
            {#if refreshRequired}<p role="alert" class="text-sm">
                    닫으면 현재 경기 상태를 다시 확인해요.
                </p>{/if}
            {#if completed && pending}<p role="status" class="text-sm">
                    경기가 끝나 남은 파일은 기록하지 않았어요.
                </p>{/if}
        {/if}
    </div>
</Dialog>
