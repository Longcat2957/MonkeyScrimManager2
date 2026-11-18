<script lang="ts">
    import { resolve } from '$app/paths';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import SeasonSelector from '#lib/components/common/SeasonSelector.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import type { RecordSeason } from '#lib/features/seasons.ts';
    import type { GuildRanking, LolPosition, RankingEntry, RankingPage } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import type { SectionResult } from '#lib/features/section.ts';

    type Props = {
        guildId: string;
        ranking: SectionResult<GuildRanking | null>;
        onretry: () => Promise<void>;
        seasons?: RecordSeason[];
        selectedSeasonId?: string | null;
    };

    let { guildId, ranking, onretry, seasons = [], selectedSeasonId = null }: Props = $props();

    let active = $state(0);
    const position = $derived(POSITIONS[active]);
    // 포지션마다 서버가 준 첫 쪽에서 시작해 스크롤할 때 이어 붙인다. 페이지 데이터가 바뀌면 처음으로 돌아간다.
    let pages = $derived<Partial<Record<LolPosition, RankingPage>>>(
        ranking.ok && ranking.value ? { ...ranking.value.positions } : {}
    );
    const board = $derived(pages[position.key]);
    // 내 순위가 아직 불러오지 않은 구간에 있을 때만 아래에 고정한다. 목록에 있으면 같은 링크를 두 번 두지 않는다.
    const pinnedMe = $derived(board?.me && !board.entries.some((entry) => entry.isMe) ? board.me : null);

    let scroller: HTMLDivElement | null = $state(null);
    let sentinel: HTMLDivElement | null = $state(null);
    let loading = $state(false);
    let failed = $state(false);
    let controller: AbortController | null = null;

    // 목록 끝이 보이면 다음 쪽을 이어 붙인다. 스크롤 영역 안에서만 관찰한다.
    $effect(() => {
        void position.key;
        void selectedSeasonId;
        void loading;
        void failed;
        const root = scroller;
        const target = sentinel;
        if (!root || !target) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                if (loading || failed || !board?.hasMore) return;
                void loadMore();
            },
            { root, rootMargin: '0px 0px 120px 0px' }
        );
        observer.observe(target);
        return () => observer.disconnect();
    });

    $effect(() => {
        void guildId;
        void ranking;
        void selectedSeasonId;
        loading = false;
        failed = false;
        scroller?.scrollTo({ top: 0 });
        // 서버·첫 쪽 데이터가 바뀌거나 화면을 떠나면 이전 요청의 결과를 사용하지 않는다.
        return () => {
            controller?.abort();
            controller = null;
        };
    });

    function selectPosition(index: number) {
        active = index;
        loading = false;
        failed = false;
        scroller?.scrollTo({ top: 0 });
    }

    async function loadMore() {
        if (loading) return;
        const key = position.key;
        const current = pages[key];
        if (!current?.hasMore) return;
        const requestGuild = guildId;
        const requestSeason = selectedSeasonId;
        const source = ranking;
        const request = new AbortController();
        controller = request;
        const activeRequest = () =>
            controller === request &&
            !request.signal.aborted &&
            guildId === requestGuild &&
            selectedSeasonId === requestSeason &&
            ranking === source;
        const fetchPage = async (offset: number): Promise<RankingPage> => {
            const query = new URLSearchParams({ position: key, offset: String(offset) });
            if (requestSeason) query.set('season', requestSeason);
            const response = await fetch(
                `${resolve('/g/[guildId]/ranking', { guildId: requestGuild })}?${query}`,
                { signal: request.signal }
            );
            if (!response.ok) throw new Error(String(response.status));
            return response.json();
        };
        // 로딩 중에는 다시 요청하지 않고, loading이 false로 돌아오면 끝이 보일 때 다음 쪽을 요청한다.
        loading = true;
        try {
            const next = await fetchPage(current.entries.length);
            if (!activeRequest()) return;
            const entries = [...current.entries, ...next.entries];
            if (new Set(entries.map(identityKey)).size !== entries.length) {
                // 순위 변동으로 쪽이 겹치면 빠진 사용자를 임의로 건너뛰지 않고 첫 쪽부터 다시 시작한다.
                const first = await fetchPage(0);
                if (!activeRequest()) return;
                pages = { ...pages, [key]: first };
                if (position.key === key) scroller?.scrollTo({ top: 0 });
            } else {
                pages = { ...pages, [key]: { ...next, entries } };
            }
            if (position.key === key) failed = false;
        } catch {
            if (activeRequest() && position.key === key) failed = true;
        } finally {
            if (controller === request) {
                controller = null;
                loading = false;
            }
        }
    }

    const MEDAL = ['text-medal-gold', 'text-medal-silver', 'text-medal-bronze'];
    const identityKey = (entry: RankingEntry) => entry.identityKey ?? entry.userId;
    const winRate = (entry: RankingEntry) => (entry.games ? Math.round((entry.wins / entry.games) * 100) : 0);
</script>

{#snippet row(entry: RankingEntry)}
    <a
        href={`${resolve('/g/[guildId]/players/[userId]', { guildId, userId: entry.userId })}${selectedSeasonId ? `?season=${selectedSeasonId}` : ''}`}
        class="grid min-h-12 grid-cols-[1.75rem_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm hover:bg-surface-hover focus-visible:-outline-offset-2 @min-[34rem]:gap-3"
    >
        <span
            class={['font-brand text-center font-bold tabular-nums', MEDAL[entry.rank - 1] ?? 'text-muted']}
        >
            <span class="sr-only">순위 </span>{entry.rank}
        </span>
        <PlayerFace name={entry.displayName} imageUrl={entry.iconUrl} size="sm" />
        <span
            class="flex min-w-0 flex-col gap-x-3 @min-[34rem]:flex-row @min-[34rem]:flex-wrap @min-[34rem]:items-baseline"
        >
            <span class="font-medium wrap-anywhere">
                {entry.displayName}
                {#if entry.isMe}<span class="text-xs font-semibold text-nexus">나</span>{/if}
            </span>
            <span class="text-xs tabular-nums text-muted"
                >{entry.games}전 {entry.wins}승 · 승률 {winRate(entry)}%</span
            >
        </span>
        <span class="font-semibold tabular-nums"
            ><span class="sr-only">MMR </span>{Math.round(entry.mmr).toLocaleString('ko-KR')}</span
        >
    </a>
{/snippet}

<section aria-labelledby="ranking" class="@container min-w-0 border-t border-line">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <h2 id="ranking" class="text-base font-semibold">서버 순위</h2>
        {#if seasons.length}
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <span class="text-xs text-muted">포지션별 MMR</span>
                <SeasonSelector {seasons} {selectedSeasonId} />
            </div>
        {:else if ranking.ok && ranking.value}
            <span class="text-xs text-muted">{ranking.value.seasonName} · 포지션별 MMR</span>
        {/if}
    </div>

    {#if !ranking.ok}
        <SectionState state="error" message="순위를 불러오지 못했어요" {onretry} />
    {:else if !ranking.value}
        <SectionState state="empty" message="조회할 시즌의 순위가 아직 없어요" />
    {:else}
        <div class="panel overflow-hidden">
            <div role="group" aria-label="포지션 선택" class="border-b border-line p-2">
                <SelectionTabs
                    labels={POSITIONS.map(({ text }) => text)}
                    {active}
                    onchange={selectPosition}
                />
            </div>
            {#if board && board.entries.length}
                <!-- 카드 안에서 스크롤하며 다음 순위를 불러온다. 페이지 전체 길이는 늘어나지 않는다. -->
                <div bind:this={scroller} class="relative max-h-72 overflow-y-auto overscroll-contain">
                    <ul aria-label={`${position.text} 순위`} class="divide-y divide-line">
                        {#each board.entries as entry (identityKey(entry))}
                            <li>{@render row(entry)}</li>
                        {/each}
                    </ul>
                    <div
                        bind:this={sentinel}
                        class="px-3 py-3 text-center text-xs text-muted"
                        aria-live="polite"
                    >
                        {#if failed}
                            <button
                                type="button"
                                class="min-h-11 px-3 underline"
                                onclick={() => void loadMore()}
                            >
                                불러오지 못했어요. 눌러서 다시 시도해 주세요
                            </button>
                        {:else if loading}
                            <Spinner label="순위 불러오는 중" />
                        {:else if !board.hasMore}
                            마지막 순위예요
                        {/if}
                    </div>
                </div>
                {#if pinnedMe}
                    <div class="border-t border-line bg-selected">
                        {@render row(pinnedMe)}
                    </div>
                {/if}
            {:else}
                <p class="px-3 py-8 text-center text-sm text-muted">
                    {position.text} 기록이 아직 없어요
                </p>
            {/if}
        </div>
    {/if}
</section>
