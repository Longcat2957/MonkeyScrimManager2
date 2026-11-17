<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import MatchTable from '#lib/components/matches/MatchTable.svelte';
    import MatchFilters from '#lib/components/matches/MatchFilters.svelte';
    import type { MatchListItem } from '#lib/features/matches/types.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const guildId = $derived(page.params.guildId!);
    // 같은 목록의 검색·쪽만 바뀌는 동안에는 이전 결과를 흐리게 둔다.
    const changing = $derived(navigating.to?.route.id === page.route.id);

    const hrefFor = (match: MatchListItem) =>
        resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.id });

    async function navigate(params: {
        page?: number;
        q?: string;
        from?: string;
        to?: string;
        seasonId?: string | null;
    }) {
        if (changing) return;
        const url = new URL(page.url.href);
        const set = (key: string, value: string | null) =>
            value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
        if (params.q !== undefined) {
            url.searchParams.delete('page');
            set('q', params.q.trim() || null);
            set('from', params.from || null);
            set('to', params.to || null);
            set('season', params.seasonId || null);
        }
        if (params.page !== undefined) set('page', params.page === 1 ? null : String(params.page));
        await goto(url, { reset: false });
    }
</script>

<svelte:head>
    <title>경기 기록 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 class="flex items-center gap-2 text-2xl font-semibold">
            경기 기록
            {#if changing}<Spinner label="경기 목록 불러오는 중" />{/if}
        </h1>
    </div>

    {#if !data.empty || data.filterError}
        <MatchFilters
            q={data.q}
            from={data.from}
            to={data.to}
            seasons={data.seasons}
            selectedSeasonId={data.selectedSeasonId}
            filterError={data.filterError}
            disabled={changing}
            onapply={navigate}
        />
    {/if}

    {#if data.filterError}
        <!-- 잘못된 기간은 필터 폼에서 수정하며 조회하지 않은 결과를 빈 기록으로 표시하지 않는다. -->
    {:else if data.empty}
        <SectionState state="empty" message="아직 기록된 경기가 없어요" />
    {:else}
        <div
            aria-busy={changing}
            class={['flex flex-col gap-6 transition-opacity', changing && 'opacity-50']}
        >
            <!-- 진행 중인 경기가 없으면 빈 표를 두지 않는다. -->
            {#if data.live.length}
                <MatchTable
                    id="live-matches"
                    title="진행 중"
                    count={data.live.length}
                    matches={data.live}
                    emptyMessage=""
                    {hrefFor}
                />
            {/if}
            <MatchTable
                id="done-matches"
                title="종료"
                count={data.doneTotal}
                matches={data.done}
                emptyMessage={data.doneTotal > 0
                    ? '이 페이지에는 경기가 없어요. 다른 페이지를 선택해 주세요.'
                    : data.q || data.from || data.to || data.selectedSeasonId
                      ? '조건에 맞는 경기가 없어요'
                      : '아직 끝난 경기가 없어요'}
                {hrefFor}
            >
                {#snippet footer()}
                    {#if data.doneTotal > data.pageSize}
                        <div class="border-t border-brass-line py-2">
                            <PageNav
                                total={data.doneTotal}
                                pageSize={data.pageSize}
                                current={data.page}
                                onchange={(current) => navigate({ page: current })}
                            />
                        </div>
                    {:else if data.doneTotal > 0 && data.page > 1}
                        <div class="flex justify-center border-t border-brass-line py-2">
                            <Button
                                type="button"
                                variant="quiet"
                                injClass="min-h-12 px-3"
                                onclick={() => navigate({ page: 1 })}>첫 페이지로</Button
                            >
                        </div>
                    {/if}
                {/snippet}
            </MatchTable>
        </div>
    {/if}
</div>
