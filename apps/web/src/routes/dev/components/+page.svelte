<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import CheckboxField from '#lib/components/common/CheckboxField.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import RadioGroup from '#lib/components/common/RadioGroup.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectField from '#lib/components/common/SelectField.svelte';
    import Skeleton from '#lib/components/common/Skeleton.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import SwitchCell from '#lib/components/common/SwitchCell.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';

    let text = $state('');
    let choice = $state('one');
    let checked = $state(false);
    let radio = $state('a');
    let toggle = $state(true);
    let dialogOpen = $state(false);
    let result = $state('');
    let page = $state(1);

    const statuses = [
        { text: '모집 중', state: 'theme' },
        { text: '완료', state: 'success' },
        { text: '대기', state: 'warning' },
        { text: '실패', state: 'error' },
        { text: '안내', state: 'info' },
        { text: '없음', state: 'neutral' }
    ] as const;
</script>

<svelte:head>
    <title>컴포넌트 테스트 | {SERVICE_NAME}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">컴포넌트 테스트</h1>

<div class="mt-8 flex flex-col gap-6">
    <section class="hex-panel flex flex-col gap-4 p-4">
        <h2 class="text-lg font-semibold">Button</h2>
        <div class="flex flex-wrap items-center gap-2">
            <Button variant="primary" onclick={() => (result = '주 작업')}>주 작업</Button>
            <Button variant="secondary" onclick={() => (result = '보조 작업')}>보조 작업</Button>
            <Button variant="quiet" onclick={() => (result = '조용한 작업')}>조용한 작업</Button>
            <Button variant="danger" onclick={() => (result = '위험 작업')}>위험 작업</Button>
            <Button variant="primary" loading>저장 중</Button>
            <Button variant="secondary" disabled>비활성</Button>
        </div>
        {#if result}<p role="status" class="text-sm">{result}</p>{/if}
    </section>

    <section class="hex-panel flex flex-col gap-4 p-4">
        <h2 class="text-lg font-semibold">입력</h2>
        <div class="grid gap-4 sm:grid-cols-2">
            <TextField label="제목" bind:value={text} placeholder="예: 10월 정기 내전" maxlength={50} />
            <TextField label="오류 예시" value="잘못된 값" error="형식을 확인해 주세요" />
            <SelectField
                label="선택"
                bind:value={choice}
                options={[
                    { value: 'one', label: '첫째' },
                    { value: 'two', label: '둘째' }
                ]}
            />
            <div class="flex flex-col gap-2">
                <CheckboxField label="동의" bind:checked hint="필수 항목이에요" />
                <RadioGroup
                    legend="범위"
                    name="scope"
                    bind:value={radio}
                    options={[
                        { value: 'a', label: '전체' },
                        { value: 'b', label: '내전만' }
                    ]}
                />
            </div>
        </div>
        <div class="rounded-(--radius-box) border border-brass-line">
            <SwitchCell title="알림 받기" subTitle="새 내전이 열리면 알려 줘요" bind:active={toggle} />
        </div>
    </section>

    <section class="hex-panel flex flex-col gap-4 p-4">
        <h2 class="text-lg font-semibold">상태</h2>
        <div class="flex flex-wrap gap-2">
            {#each statuses as status (status.text)}
                <StatusTag text={status.text} state={status.state} />
            {/each}
        </div>
    </section>

    <section class="hex-panel flex flex-col gap-4 p-4">
        <h2 class="text-lg font-semibold">Dialog</h2>
        <div>
            <Button variant="secondary" onclick={() => (dialogOpen = true)}>대화상자 열기</Button>
        </div>
    </section>

    <section class="hex-panel flex flex-col gap-4 p-4">
        <h2 class="text-lg font-semibold">불러오기</h2>
        <Spinner />
        <Skeleton rows={2} />
        <SectionState state="empty" message="아직 내전이 없어요" />
    </section>

    <section class="hex-panel flex flex-col gap-4 p-4">
        <h2 class="text-lg font-semibold">PageNav</h2>
        <PageNav total={42} pageSize={10} current={page} onchange={(next) => (page = next)} />
    </section>
</div>

<Dialog bind:open={dialogOpen} title="대화상자">
    <p class="leading-7">네이티브 dialog가 포커스와 Escape 닫기를 처리해요.</p>
    {#snippet footer()}
        <div class="flex justify-end">
            <Button variant="primary" onclick={() => (dialogOpen = false)}>확인</Button>
        </div>
    {/snippet}
</Dialog>
