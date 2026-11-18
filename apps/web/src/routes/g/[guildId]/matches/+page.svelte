<script lang="ts">
    import { resolve } from '$app/paths';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import MatchTable from '#lib/components/matches/MatchTable.svelte';
    import MatchFilters from '#lib/components/matches/MatchFilters.svelte';
    import type { MatchListItem } from '#lib/features/matches/types.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const guildId = $derived(page.params.guildId!);
    // 같은 목록의 검색·쪽만 바뀌는 동안에는 이전 결과를 흐리게 둔다.
    const changing = $derived(navigating.to?.route.id === page.route.id);

    function hrefFor(match: MatchListItem) {
        const path = resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.id });
        return match.matchedGameId ? `${path}?game=${encodeURIComponent(match.matchedGameId)}` : path;
    }

    function hrefForPage(current: number) {
        const url = new URL(page.url.href);
        if (current === 1) url.searchParams.delete('page');
        else url.searchParams.set('page', String(current));
        return url.pathname + url.search;
    }
</script>

<svelte:head>
    <title>경기 기록 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex min-w-0 flex-col gap-4">
    <div class="page-head">
        <h1 class="flex items-center gap-2 text-title font-bold">
            경기 기록
            {#if changing}<Spinner label="경기 목록 불러오는 중" />{/if}
        </h1>
    </div>

    {#key JSON.stringify( [data.player, data.champion, data.q, data.bestOf, data.from, data.to, data.selectedSeasonId, data.filterError] )}
        <MatchFilters
            q={data.q}
            player={data.player}
            champion={data.champion}
            championSuggestions={data.championSuggestions}
            bestOf={data.bestOf}
            from={data.from}
            to={data.to}
            seasons={data.seasons}
            selectedSeasonId={data.selectedSeasonId}
            filterError={data.filterError}
            disabled={changing}
        />
    {/key}

    {#if !data.filterError}
        <div aria-busy={changing} class={['min-w-0 transition-opacity', changing && 'opacity-50']}>
            <MatchTable
                count={data.total}
                matches={data.matches}
                emptyMessage={data.empty
                    ? '아직 기록된 경기가 없어요'
                    : data.total > 0
                      ? '이 페이지에는 경기가 없어요. 다른 페이지를 선택해 주세요.'
                      : '조건에 맞는 경기가 없어요. 검색어나 필터를 바꿔 보세요.'}
                {hrefFor}
            />
            {#if data.total > data.pageSize}
                <PageNav
                    total={data.total}
                    pageSize={data.pageSize}
                    current={data.page}
                    hrefFor={hrefForPage}
                />
            {:else if data.page > 1 && data.total > 0}
                <div class="flex justify-center py-2">
                    <Button href={hrefForPage(1)} variant="quiet">첫 페이지로</Button>
                </div>
            {/if}
        </div>
    {/if}
</div>
