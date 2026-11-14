<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import { Button, CellGroup, ImageList, Input, Popup, toast } from 'stdf';
    import type { ImageListItemProps } from 'stdf';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import LinkCell from '#lib/components/common/LinkCell.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import { demoScrim, demoStatuses } from '#lib/mocks/component-demo/index.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { inputFeedback, inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    let popupOpen = $state(false);
    let title = $state('');
    let titleError = $state('');
    let confirmResult = $state('');
    let files: ImageListItemProps[] = $state([]);
    let imageList = $state<ImageList>();
    let picker = $state<HTMLInputElement>();
    let form = $state<HTMLFormElement>();
    let fileError = $state('');
    let actionResult = $state('');
    let retryAttempts = $state(0);
    let recovered = $state(false);
    let popupPosition = $state<'center' | 'bottom'>('bottom');
    const id = $props.id();

    $effect(() => {
        if (!popupOpen) popupPosition = desktop.current ? 'center' : 'bottom';
    });

    onDestroy(() => {
        for (const item of files) if (item.url) URL.revokeObjectURL(item.url);
    });

    function removeFile(item: ImageListItemProps) {
        if (item.url) URL.revokeObjectURL(item.url);
        files = files.filter((file) => file.id !== item.id);
        fileError = '';
    }

    async function retryDemo() {
        await new Promise((resolve) => setTimeout(resolve, 400));
        retryAttempts++;
        if (retryAttempts === 1) throw new Error('재시도 실패 확인');
        recovered = true;
    }

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        titleError = title.trim() ? '' : '제목을 입력해 주세요';
        if (titleError) {
            await tick();
            form?.querySelector('input')?.focus();
            return;
        }
        popupOpen = false;
        toast.success('저장했어요');
    }

    async function askConfirm() {
        confirmResult = (await confirm('이 작업을 진행할까요?', '확인')) ? '확인함' : '취소함';
    }
</script>

<svelte:head>
    <title>컴포넌트 테스트 | {SERVICE_NAME}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">컴포넌트 테스트</h1>

<div class="mt-8 flex flex-col gap-12">
    <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">ScrimSummary</h2>
        <ScrimSummary scrim={demoScrim} headingLevel={3} />
    </section>

    <section class="flex flex-col gap-4">
        <h2 id="status-demo" tabindex="-1" class="text-lg font-semibold">상태 Tag</h2>
        <div class="flex flex-wrap gap-2">
            {#each demoStatuses as status (status.key)}
                <StatusTag text={status.text} state={status.state} />
            {/each}
        </div>
    </section>

    <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">LinkCell</h2>
        <CellGroup my="0" mx="0" shadow="none">
            <ul>
                <li>
                    <LinkCell
                        href="#status-demo"
                        title="상태 Tag 예제로 이동"
                        subTitle="모집·편성·대진·종료 상태"
                        line
                        info="신청함"
                    >
                        {#snippet detailChild()}<StatusTag text="모집 중" state="theme" />{/snippet}
                    </LinkCell>
                </li>
                <li><LinkCell href="#section-state-demo" title="SectionState 예제로 이동" /></li>
            </ul>
        </CellGroup>
    </section>

    <section class="flex flex-col gap-4">
        <h2 id="section-state-demo" tabindex="-1" class="text-lg font-semibold">SectionState</h2>
        <SectionState state="loading" />
        <SectionState state="empty" message="아직 내전이 없어요" />
        {#if recovered}
            <p role="status" class="text-sm text-success">목록을 다시 불러왔어요</p>
        {:else}
            <SectionState state="error" message="목록을 불러오지 못했어요" onretry={retryDemo} />
        {/if}
    </section>

    <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Button</h2>
        <div class="flex flex-wrap items-center gap-2">
            <Button
                size="auto"
                heightOut="0"
                injClass="px-4"
                onclick={() => (actionResult = '주 작업 버튼을 눌렀어요')}>주 작업</Button
            >
            <Button
                fill="lineLight"
                size="auto"
                heightOut="0"
                injClass="px-4"
                onclick={() => (actionResult = '보조 작업 버튼을 눌렀어요')}>보조 작업</Button
            >
            <Button
                fill="textState"
                state="error"
                size="auto"
                heightOut="0"
                injClass="px-4"
                onclick={() => (actionResult = '위험 작업 버튼을 눌렀어요')}>위험 작업</Button
            >
            <Button size="auto" heightOut="0" injClass="px-4" loading={{}}>저장 중</Button>
            <Button size="auto" heightOut="0" injClass="px-4" disabled>비활성</Button>
        </div>
        {#if actionResult}<p role="status" class="text-sm">{actionResult}</p>{/if}
    </section>

    <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">오버레이</h2>
        <p class="text-sm opacity-70">
            포커스 이동, Escape 닫기, 배경 inert, 닫은 뒤 포커스 복귀를 확인한다.
        </p>
        <div class="flex flex-wrap items-center gap-2">
            <Button
                fill="lineLight"
                size="auto"
                heightOut="0"
                injClass="px-4"
                onclick={() => (popupOpen = true)}
            >
                입력 팝업 열기
            </Button>
            <Button fill="lineLight" size="auto" heightOut="0" injClass="px-4" onclick={askConfirm}
                >확인 창 열기</Button
            >
            {#if confirmResult}<span role="status" class="text-sm">{confirmResult}</span>{/if}
        </div>
    </section>

    <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">ImageList (.rofl)</h2>
        <ImageList
            bind:this={imageList}
            bind:value={files}
            max={3}
            radius="md"
            previewable={false}
            columns={3}
            injClass="max-w-xl grid-cols-2! sm:grid-cols-3!"
            aspectRatio={[3, 2]}
            onclickUpload={() => picker?.click()}
            onexceed={() => (fileError = '파일은 3개까지 선택할 수 있어요')}
            onoversized={() => (fileError = '10MB 이하의 파일을 골라 주세요')}
        >
            {#snippet uploadChild()}
                <span class="flex h-full items-center justify-center p-2 text-xs font-semibold"
                    >ROFL 선택</span
                >
            {/snippet}
            {#snippet itemChild(item)}
                <span class="flex h-full flex-col justify-between gap-1 p-2">
                    <span class="line-clamp-2 text-xs break-all">{item.file?.name ?? item.id}</span>
                    <Button
                        fill="text"
                        size="auto"
                        heightOut="0"
                        heightIn="1"
                        injClass="min-h-11 min-w-11 self-end px-2 text-xs"
                        onclick={() => removeFile(item)}
                        ><span class="sr-only">{item.file?.name} </span>선택 해제</Button
                    >
                </span>
            {/snippet}
        </ImageList>
        <input
            bind:this={picker}
            type="file"
            accept=".rofl"
            multiple
            hidden
            onchange={(event) => {
                fileError = '';
                imageList?.addFiles([...(event.currentTarget.files ?? [])]);
                event.currentTarget.value = '';
            }}
        />
        {#if fileError}<p role="alert" class="text-sm text-error">{fileError}</p>{/if}
    </section>
</div>

<div {@attach overlay({ open: popupOpen, label: '모집 만들기', onclose: () => (popupOpen = false) })}>
    <Popup bind:visible={popupOpen} position={popupPosition} size={0} maskClosable={false} transparent>
        <form
            bind:this={form}
            class="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
            onsubmit={submit}
            novalidate
            {@attach nonSubmitButtons}
        >
            <h2 class="text-lg font-semibold">모집 만들기</h2>
            <div {@attach inputLabel('제목')} {@attach inputFeedback(titleError, `${id}-title-error`)}>
                <Input
                    title="제목"
                    titlePosition="out"
                    bind:value={title}
                    placeholder="예: 10월 정기 내전"
                    state={titleError ? 'error' : 'theme'}
                    required
                    maxlength={50}
                />{#if titleError}<p id={`${id}-title-error`} role="alert" class="text-sm text-error">
                        {titleError}
                    </p>{/if}
            </div>
            <div class="flex justify-end gap-2">
                <Button
                    type="button"
                    fill="lineLight"
                    size="auto"
                    heightOut="0"
                    injClass="px-4"
                    onclick={() => (popupOpen = false)}
                >
                    취소
                </Button>
                <Button type="submit" size="auto" heightOut="0" injClass="px-4">만들기</Button>
            </div>
        </form>
    </Popup>
</div>
