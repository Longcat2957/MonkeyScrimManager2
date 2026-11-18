<script lang="ts">
    import { resolve } from '$app/paths';
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
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import { POSITIONS, SCRIM_STATUS } from '#lib/features/labels.ts';

    // 개발 화면으로 이동하기 위한 임시 경로 값이다.
    const guildId = 'devGuild001';
    const scrimId = 'devScrim001';
    // 편성 화면은 편성 방식이 맞는 준비 단계 내전으로 연결한다.
    const manualScrimId = 'devScrim007';
    const auctionScrimId = 'devScrim002';
    // 대진 운영은 팀 편성이 끝난 내전에서 팀을 대진 자리에 직접 배치한다.
    const bracketScrimId = 'devScrim008';
    const completedBracketScrimId = 'devScrim005';
    const matchId = 'devMatch001';
    const userId = 'devUser001';
    const shortcutGroups = [
        {
            title: '모집·참가',
            links: [
                { label: '서버 홈', href: resolve('/g/[guildId]', { guildId }) },
                { label: '내전 목록', href: resolve('/g/[guildId]/scrims', { guildId }) },
                { label: '내전 상세', href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }) }
            ]
        },
        {
            title: '팀·대진 운영',
            links: [
                {
                    label: '수동 팀 편성',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/manual', { guildId, scrimId: manualScrimId })
                },
                {
                    label: '경매',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/auction', {
                        guildId,
                        scrimId: auctionScrimId
                    })
                },
                {
                    label: '대진 운영',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', {
                        guildId,
                        scrimId: bracketScrimId
                    })
                },
                {
                    label: '대진 결과',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/result', {
                        guildId,
                        scrimId: completedBracketScrimId
                    })
                }
            ]
        },
        {
            title: '기록·통계',
            links: [
                { label: '경기 기록', href: resolve('/g/[guildId]/matches', { guildId }) },
                { label: '경기 상세', href: resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId }) },
                { label: '참가자 전적', href: resolve('/g/[guildId]/players/[userId]', { guildId, userId }) },
                { label: '서버 통계', href: resolve('/g/[guildId]/stats', { guildId }) }
            ]
        },
        {
            title: '계정·관리',
            links: [
                { label: '내 정보', href: `${resolve('/me')}?mock=1` },
                { label: '백오피스', href: `${resolve('/backoffice')}?mock=1` },
                { label: '서버 관리', href: resolve('/g/[guildId]/admin', { guildId }) }
            ]
        }
    ];

    let text = $state('');
    let choice = $state('manual');
    let checked = $state(false);
    let radio = $state('all');
    let toggle = $state(true);
    let dialogOpen = $state(false);
    let result = $state('');
    let page = $state(1);

    const statuses = Object.values(SCRIM_STATUS);
</script>

<svelte:head>
    <title>컴포넌트 테스트 | {SERVICE_NAME}</title>
</svelte:head>

<header class="page-head mb-5 max-w-5xl">
    <h1 class="text-title font-bold">컴포넌트 테스트</h1>
</header>

<div class="grid max-w-5xl items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(17rem,2fr)]">
    <section class="panel">
        <h2 class="panel-bar font-bold">버튼</h2>
        <div class="flex flex-wrap items-center gap-2 p-4">
            <Button variant="primary" onclick={() => (result = '저장 선택')}>저장</Button>
            <Button variant="secondary" onclick={() => (result = '수정 선택')}>수정</Button>
            <Button variant="quiet" onclick={() => (result = '취소 선택')}>취소</Button>
            <Button variant="danger" onclick={() => (result = '삭제 선택')}>삭제</Button>
            <Button variant="primary" loading>저장 중</Button>
            <Button variant="secondary" disabled>비활성</Button>
        </div>
        <p role="status" class="px-4 pb-3 text-ui text-muted empty:hidden">{result}</p>
    </section>

    <section class="panel xl:col-start-2 xl:row-span-2">
        <h2 class="panel-bar font-bold">입력</h2>
        <div class="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-1">
            <TextField label="제목" bind:value={text} placeholder="예: 10월 정기 내전" maxlength={50} />
            <TextField label="오류 예시" value="잘못된 값" error="형식을 확인해 주세요" />
            <SelectField
                label="편성 방식"
                bind:value={choice}
                options={[
                    { value: 'manual', label: '수동 편성' },
                    { value: 'auction', label: '경매' }
                ]}
            />
            <div class="flex flex-col gap-2">
                <CheckboxField label="동의" bind:checked hint="필수 항목이에요" />
                <RadioGroup
                    legend="범위"
                    name="scope"
                    bind:value={radio}
                    options={[
                        { value: 'all', label: '전체' },
                        { value: 'scrims', label: '내전만' }
                    ]}
                />
            </div>
        </div>
        <div class="border-t border-line">
            <SwitchCell title="알림 받기" subTitle="새 내전이 열리면 알려 줘요" bind:active={toggle} />
        </div>
    </section>

    <section class="panel">
        <h2 class="panel-bar font-bold">내전 상태와 포지션</h2>
        <div class="flex flex-wrap items-center gap-2 p-4">
            {#each statuses as status (status.text)}
                <StatusTag text={status.text} state={status.state} />
            {/each}
            <StatusTag text="미정" state="neutral" />
        </div>
        <ul class="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-4 py-3">
            {#each POSITIONS as position (position.key)}
                <li class="inline-flex items-center gap-1.5 text-ui font-semibold">
                    <PositionIcon position={position.key} size="sm" />{position.text}
                </li>
            {/each}
        </ul>
    </section>

    <section class="panel">
        <h2 class="panel-bar font-bold">대화상자</h2>
        <div class="p-4">
            <Button variant="secondary" onclick={() => (dialogOpen = true)}>대화상자 열기</Button>
        </div>
    </section>

    <section class="panel">
        <h2 class="panel-bar font-bold">불러오기</h2>
        <div class="space-y-3 p-4">
            <Spinner />
            <Skeleton rows={2} />
            <SectionState state="empty" message="아직 내전이 없어요" />
        </div>
    </section>

    <section class="panel xl:col-span-2">
        <h2 class="panel-bar font-bold">페이지 이동</h2>
        <div class="p-4">
            <PageNav total={42} pageSize={10} current={page} onchange={(next) => (page = next)} />
        </div>
    </section>
    <details class="panel xl:col-span-2">
        <summary class="cursor-pointer px-4 py-3 font-bold">개발 바로가기</summary>
        <nav
            aria-label="개발 바로가기"
            class="grid gap-4 border-t border-line p-4 sm:grid-cols-2 xl:grid-cols-4"
        >
            {#each shortcutGroups as group (group.title)}
                <section>
                    <h2 class="text-ui font-bold">{group.title}</h2>
                    <ul class="mt-1">
                        {#each group.links as link (link.href)}
                            <li>
                                <a
                                    class="inline-flex min-h-9 items-center text-ui text-ink-2 underline underline-offset-4 hover:text-nexus pointer-coarse:min-h-11"
                                    href={link.href}>{link.label}</a
                                >
                            </li>
                        {/each}
                    </ul>
                </section>
            {/each}
            <a
                class="inline-flex min-h-9 items-center text-ui text-ink-2 underline underline-offset-4 hover:text-nexus pointer-coarse:min-h-11"
                href={resolve('/dev/error')}
                data-sveltekit-preload-data="false">오류 화면</a
            >
        </nav>
    </details>
</div>

<Dialog bind:open={dialogOpen} title="대화상자">
    <p class="leading-7">네이티브 dialog가 포커스와 Escape 닫기를 처리해요.</p>
    {#snippet footer()}
        <div class="flex justify-end">
            <Button variant="primary" onclick={() => (dialogOpen = false)}>확인</Button>
        </div>
    {/snippet}
</Dialog>
