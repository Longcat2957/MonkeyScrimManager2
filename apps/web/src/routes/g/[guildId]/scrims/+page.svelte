<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import ScrimListRow from '#lib/components/scrims/ScrimListRow.svelte';
    import ScrimSettingsDialog from '#lib/components/scrims/ScrimSettingsDialog.svelte';
    import { editableFields, TEAM_COUNT } from '#lib/features/scrims/settings.ts';
    import type { ScrimListItem, ScrimSettings, ScrimStatusFilter } from '#lib/features/scrims/types.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const FILTERS: { key: ScrimStatusFilter; text: string }[] = [
        { key: 'all', text: '전체' },
        { key: 'recruit', text: '모집 중' },
        { key: 'active', text: '진행 중' },
        { key: 'done', text: '종료' }
    ];
    let newScrim = $state<ScrimSettings>({
        title: '',
        scheduledAt: null,
        teamCount: TEAM_COUNT.min,
        reserveCapacity: 2,
        hardFearless: false
    });
    // 새 모집은 모집 단계이므로 모든 설정을 입력받는다.
    const CREATE_FIELDS = editableFields('recruit');

    const guildId = $derived(page.params.guildId!);
    const active = $derived(FILTERS.findIndex((filter) => filter.key === data.statusFilter));
    const labels = $derived(FILTERS.map((filter) => `${filter.text} ${data.counts[filter.key]}`));
    const calendarMonth = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        timeZone: 'Asia/Seoul'
    });
    // 현재 쪽의 모집을 먼저 보여 주고 나머지는 서버가 정한 일정순으로 묶는다.
    const sections = $derived.by(() => {
        const groups: { label: string; monthGrouped: boolean; scrims: ScrimListItem[] }[] = [];
        const recruiting: ScrimListItem[] = [];
        for (const scrim of data.scrims) {
            if (data.statusFilter === 'all' && scrim.status === 'recruit') {
                recruiting.push(scrim);
                continue;
            }
            const label = scrim.scheduledAt ? calendarMonth.format(new Date(scrim.scheduledAt)) : '일정 미정';
            const last = groups.at(-1);
            if (last?.label === label) last.scrims.push(scrim);
            else groups.push({ label, monthGrouped: true, scrims: [scrim] });
        }
        if (recruiting.length)
            groups.unshift({ label: '이 페이지의 모집', monthGrouped: false, scrims: recruiting });
        return groups;
    });
    // 같은 목록의 필터·쪽만 바뀌는 동안에는 이전 결과를 흐리게 둔다.
    const changing = $derived(navigating.to?.route.id === page.route.id);

    let creating = $state(false);

    function openRecruitment() {
        newScrim.scheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
        creating = true;
    }

    function navigate(params: { status?: ScrimStatusFilter; page?: number }) {
        const url = new URL(page.url.href);
        if (params.status !== undefined) {
            url.searchParams.delete('page');
            if (params.status === 'all') url.searchParams.delete('status');
            else url.searchParams.set('status', params.status);
        }
        if (params.page !== undefined) {
            if (params.page === 1) url.searchParams.delete('page');
            else url.searchParams.set('page', String(params.page));
        }
        goto(url, { reset: false });
    }

    async function created(result: Record<string, unknown> | undefined) {
        const scrimId = String(result?.id ?? '');
        if (scrimId) await goto(resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }));
    }
</script>

<svelte:head>
    <title>내전 | {SERVICE_NAME}</title>
</svelte:head>

<div class="@container flex min-w-0 flex-col gap-5">
    <header class="page-head">
        <h1 class="text-title font-bold">내전</h1>
        {#if data.can.createScrim}
            <span class="shrink-0">
                <Button variant="primary" onclick={openRecruitment}>모집 만들기</Button>
            </span>
        {/if}
    </header>

    {#if data.counts.all === 0}
        <SectionState state="empty" message="아직 내전이 없어요" />
    {:else}
        <section aria-labelledby="scrim-list" aria-busy={changing} class="grid min-w-0 gap-5">
            <div class="flex flex-wrap items-center gap-3 border-y border-line py-3">
                <h2 id="scrim-list" class="sr-only">{FILTERS[active]?.text} 내전</h2>
                <div role="group" aria-label="상태 필터" class="flex min-w-0 max-w-full items-center gap-2">
                    <SelectionTabs
                        {labels}
                        {active}
                        onchange={(index) => navigate({ status: FILTERS[index]!.key })}
                    />
                    {#if changing}
                        <Spinner label="내전 목록을 불러오는 중" />
                    {/if}
                </div>
            </div>

            {#if data.scrims.length === 0}
                <SectionState state="empty" message="조건에 맞는 내전이 없어요" />
            {:else}
                <div class={['grid gap-6 transition-opacity', changing && 'opacity-60']}>
                    {#each sections as group (group.scrims[0]!.id)}
                        <section
                            aria-label={group.label}
                            class="min-w-0 @min-[46rem]:grid @min-[46rem]:grid-cols-[7rem_minmax(0,1fr)] @min-[46rem]:items-start @min-[46rem]:gap-4"
                        >
                            <h3
                                class={[
                                    'sticky top-(--app-header-height) z-10 bg-ground py-2 text-base font-semibold lg:top-0 @min-[46rem]:border-t @min-[46rem]:border-line @min-[46rem]:pt-4',
                                    group.monthGrouped ? 'text-ink-2' : 'text-nexus'
                                ]}
                            >
                                {group.label}
                            </h3>
                            <ul class="panel min-w-0 divide-y divide-line overflow-hidden">
                                {#each group.scrims as scrim (scrim.id)}
                                    <li>
                                        <ScrimListRow
                                            {scrim}
                                            monthGrouped={group.monthGrouped}
                                            showStatus={group.monthGrouped && data.statusFilter !== 'recruit'}
                                            href={resolve('/g/[guildId]/scrims/[scrimId]', {
                                                guildId,
                                                scrimId: scrim.id
                                            })}
                                        />
                                    </li>
                                {/each}
                            </ul>
                        </section>
                    {/each}
                </div>
            {/if}

            <PageNav
                total={data.total}
                pageSize={data.pageSize}
                current={data.page}
                onchange={(current) => navigate({ page: current })}
            />
        </section>
    {/if}
</div>

{#if data.can.createScrim}
    <ScrimSettingsDialog
        bind:open={creating}
        title="모집 만들기"
        submitText="만들기"
        action="create"
        initial={newScrim}
        editable={CREATE_FIELDS}
        onsaved={created}
    />
{/if}
