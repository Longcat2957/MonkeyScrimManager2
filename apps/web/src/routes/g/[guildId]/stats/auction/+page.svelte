<script lang="ts">
    import { goto } from '$app/navigation';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SeasonSelector from '#lib/components/common/SeasonSelector.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import AuctionReplay from '#lib/components/stats/AuctionReplay.svelte';
    import { formatSchedule } from '#lib/features/labels.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    const changing = $derived(navigating.to?.route.id === page.route.id);

    function href(changes: Record<string, string | null>, hash = '') {
        const url = new URL(page.url.href);
        if (data.selectedSeasonId) url.searchParams.set('season', data.selectedSeasonId);
        for (const [key, value] of Object.entries(changes)) {
            if (value) url.searchParams.set(key, value);
            else url.searchParams.delete(key);
        }
        url.hash = hash;
        return url.pathname + url.search + url.hash;
    }
</script>

<svelte:head>
    <title>경매 기록 | {SERVICE_NAME}</title>
</svelte:head>

{#snippet pagination(key: 'page' | 'archive', current: number, total: number)}
    {#if total > data.pageSize}
        {@const last = Math.ceil(total / data.pageSize)}
        {@const clear = key === 'page' ? 'player' : 'auction'}
        {@const section = key === 'page' ? 'price-index' : 'auction-index'}
        <nav
            aria-label={key === 'page' ? '선수 목록 쪽 이동' : '완료 경매 쪽 이동'}
            class="flex items-center justify-end gap-2 border-t border-line py-2 text-xs text-muted"
        >
            {#if current > 1}
                <Button
                    size="sm"
                    variant="quiet"
                    href={href({ [key]: current === 2 ? null : String(current - 1), [clear]: null }, section)}
                    >이전</Button
                >
            {/if}
            <span class="tabular-nums">{current} / {last}쪽</span>
            {#if current < last}
                <Button
                    size="sm"
                    variant="quiet"
                    href={href({ [key]: String(current + 1), [clear]: null }, section)}>다음</Button
                >
            {/if}
        </nav>
    {/if}
{/snippet}

<div class="@container flex min-w-0 flex-col gap-5">
    <header class="flex flex-wrap items-baseline justify-between gap-3">
        <h1 class="text-title font-bold">경매 기록</h1>
        <SeasonSelector
            seasons={data.seasons}
            selectedSeasonId={data.selectedSeasonId}
            onselect={(season) =>
                goto(href({ season, player: null, auction: null, page: null, archive: null }), {
                    reset: false
                })}
        />
    </header>

    {#if data.selectedAuction}
        <section id="auction-replay" aria-label="선택한 경매 리플레이" class="min-w-0 scroll-mt-4">
            <div class="mb-2 flex justify-end">
                <Button
                    variant="quiet"
                    size="sm"
                    href={href(
                        { auction: null },
                        data.selectedPlayerId ? `player-${data.selectedPlayerId}` : 'auction-index'
                    )}>리플레이 닫기</Button
                >
            </div>
            <AuctionReplay auction={data.selectedAuction} />
        </section>
    {:else if data.missingAuction}
        <p class="text-ui text-muted">선택한 경매를 이 시즌에서 찾을 수 없어요.</p>
    {/if}

    {#if !data.archive.total}
        <SectionState state="empty" message="이 시즌에는 완료된 경매가 없어요." />
    {:else}
        <div class="grid min-w-0 items-start gap-7 @min-[63rem]:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
            <section
                id="price-index"
                aria-labelledby="price-title"
                aria-busy={changing}
                class="price-index min-w-0 scroll-mt-4"
            >
                <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 id="price-title" class="text-lg font-bold">선수별 낙찰가</h2>
                    <a
                        class="py-1 text-xs font-semibold text-nexus underline-offset-4 hover:underline @min-[63rem]:hidden"
                        href="#auction-index">완료 경매 {number.format(data.archive.total)}건 보기</a
                    >
                </div>
                <p class="mt-1 text-ui text-muted">최근가와 중앙값·범위는 0P 초과 낙찰만 집계해요.</p>
                <form
                    method="GET"
                    action={page.url.pathname + '#price-index'}
                    role="search"
                    aria-label="낙찰 선수 검색"
                    class="my-4 flex max-w-md items-center gap-2"
                >
                    {#if data.selectedSeasonId}<input
                            type="hidden"
                            name="season"
                            value={data.selectedSeasonId}
                        />{/if}
                    {#if data.selectedAuction}<input
                            type="hidden"
                            name="auction"
                            value={data.selectedAuction.id}
                        />{/if}
                    {#if data.archive.page > 1}<input
                            type="hidden"
                            name="archive"
                            value={data.archive.page}
                        />{/if}
                    <label for="ledger-search" class="sr-only">선수 이름</label>
                    {#key data.q}
                        <input
                            id="ledger-search"
                            name="q"
                            type="search"
                            value={data.q}
                            placeholder="선수 이름 검색"
                            class="min-h-9 min-w-0 flex-1 rounded-form border border-line-strong bg-surface-2 px-3 text-sm text-ink placeholder:text-muted pointer-coarse:min-h-11"
                        />
                    {/key}
                    <Button type="submit">검색</Button>
                    {#if data.q}<Button
                            variant="quiet"
                            href={href({ q: null, player: null, page: null }, 'price-index')}>초기화</Button
                        >{/if}
                </form>
                {#if data.missingPlayer}
                    <p class="mb-2 text-ui text-muted">선택한 선수를 현재 낙찰 목록에서 찾을 수 없어요.</p>
                {/if}
                {#if data.players.length}
                    <div
                        aria-hidden="true"
                        class="comparison-head border-y border-line bg-surface-2 text-xs font-semibold text-muted"
                    >
                        <span>선수</span><span>최근가</span><span>중앙값</span><span>낙찰 범위</span><span
                            >낙찰 수</span
                        ><span></span>
                    </div>
                    {#each data.players as player (player.id)}
                        {@const open = data.selectedPlayerId === player.id}
                        {@const detailUrl = href(
                            {
                                player: open ? null : player.id,
                                page: data.playerPage > 1 ? String(data.playerPage) : null
                            },
                            `player-${player.id}`
                        )}
                        <details
                            id={'player-' + player.id}
                            {open}
                            class="ledger-row border-b border-line scroll-mt-4"
                        >
                            <summary
                                class="comparison-row cursor-pointer list-none text-ui tabular-nums hover:bg-surface-hover"
                                onclick={(event) => {
                                    event.preventDefault();
                                    void goto(detailUrl, { reset: false });
                                }}
                            >
                                <strong class="player-name flex min-w-0 items-center gap-2 text-sm">
                                    <PlayerFace name={player.name} imageUrl={player.avatarUrl} size="sm" />
                                    <span class="min-w-0 wrap-anywhere">{player.name}</span>
                                </strong>
                                <span class="latest font-semibold"
                                    ><span class="metric-label">최근가 </span>{number.format(
                                        player.latest
                                    )}P</span
                                >
                                <span
                                    ><span class="metric-label">중앙값 </span>{number.format(
                                        player.median
                                    )}P</span
                                >
                                <span
                                    ><span class="metric-label">낙찰 범위 </span>{number.format(
                                        player.min
                                    )}{#if player.max !== player.min}–{number.format(player.max)}{/if}P</span
                                >
                                <span><span class="metric-label">낙찰 수 </span>{player.count}건</span>
                                <svg
                                    class="chevron size-4 text-muted"
                                    aria-hidden="true"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.5"><path d="m4 6 4 4 4-4" /></svg
                                >
                            </summary>
                            {#if open}
                                <div class="transactions bg-surface px-3 pb-2 pt-3">
                                    <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                                        <h3 class="text-ui font-bold">{player.name} 거래 내역</h3>
                                        <a
                                            class="text-xs font-semibold text-nexus underline underline-offset-4"
                                            href={`/g/${page.params.guildId}/players/${encodeURIComponent(player.id)}/auction${data.selectedSeasonId ? `?season=${data.selectedSeasonId}` : ''}`}
                                            >개인 경매 기록</a
                                        >
                                    </div>
                                    <ol class="divide-y divide-line">
                                        {#each data.history as sale (sale.id)}
                                            <li
                                                class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3"
                                            >
                                                <div class="min-w-0 flex-1 basis-48">
                                                    <a
                                                        class="font-semibold text-nexus underline underline-offset-4 [overflow-wrap:anywhere]"
                                                        aria-label={`${sale.title} 경매 리플레이에서 이 거래 보기`}
                                                        href={href(
                                                            { auction: sale.auctionId },
                                                            `signing-${encodeURIComponent(sale.id)}`
                                                        )}>{sale.title}</a
                                                    >
                                                    <p
                                                        class="mt-1 text-xs text-muted [overflow-wrap:anywhere]"
                                                    >
                                                        {sale.teamCount}팀 경매 · {sale.team}{sale.price !==
                                                        null
                                                            ? ` · 낙찰 팀장 ${sale.buyer ?? '기록 없음'}`
                                                            : ''}
                                                    </p>
                                                    {#if sale.acquiredAt}<time
                                                            class="text-xs text-muted"
                                                            datetime={sale.acquiredAt}
                                                            >{formatSchedule(sale.acquiredAt)}</time
                                                        >{/if}
                                                </div>
                                                <div class="text-right tabular-nums">
                                                    <strong class="block text-ui"
                                                        >{sale.price === null
                                                            ? '수동 배정'
                                                            : `${number.format(sale.price)}P`}</strong
                                                    >
                                                    {#if sale.price !== null}
                                                        <span class="text-xs text-muted"
                                                            >{sale.budget > 0
                                                                ? `시작 예산의 ${number.format((100 * sale.price) / sale.budget)}%`
                                                                : '시작 예산 0P · 비율 없음'}</span
                                                        >
                                                    {/if}
                                                </div>
                                            </li>
                                        {/each}
                                    </ol>
                                </div>
                            {:else}
                                <a
                                    href={detailUrl}
                                    class="block p-3 text-ui font-semibold text-nexus underline"
                                    >{player.name} 거래 내역 보기</a
                                >
                            {/if}
                        </details>
                    {/each}
                    {@render pagination('page', data.playerPage, data.playerCount)}
                {:else}
                    <div class="border-y border-line">
                        <SectionState
                            state="empty"
                            message={data.q
                                ? '이름이 일치하는 낙찰 선수가 없어요.'
                                : '0P를 넘겨 낙찰된 선수가 없어요.'}
                        />
                    </div>
                {/if}
            </section>

            <section id="auction-index" aria-labelledby="archive-title" class="min-w-0 scroll-mt-4">
                <div class="flex items-baseline justify-between gap-3 border-b border-line-strong pb-3">
                    <h2 id="archive-title" class="text-lg font-bold">완료 경매</h2>
                    <span class="text-xs text-muted tabular-nums">{number.format(data.archive.total)}건</span>
                </div>
                <ul class="divide-y divide-line border-b border-line">
                    {#each data.archive.rows as auction (auction.id)}
                        <li>
                            <a
                                href={href({ auction: auction.id }, 'auction-replay')}
                                aria-current={auction.id === data.selectedAuction?.id ? 'true' : undefined}
                                class="group flex min-h-12 items-center justify-between gap-3 px-2 py-3 hover:bg-surface-hover aria-current:bg-selected"
                            >
                                <span class="grid min-w-0 gap-1">
                                    <strong class="text-ui group-hover:underline [overflow-wrap:anywhere]"
                                        >{auction.title}</strong
                                    >
                                    <span class="text-xs text-muted tabular-nums"
                                        >{auction.teams}팀 · 유상 낙찰 {auction.paid}건</span
                                    >
                                </span>
                                <span class="shrink-0 text-xs font-semibold text-nexus">리플레이</span>
                            </a>
                        </li>
                    {/each}
                </ul>
                {@render pagination('archive', data.archive.page, data.archive.total)}
            </section>
        </div>
    {/if}
</div>

<style>
    .price-index {
        container-type: inline-size;
    }
    .comparison-row,
    .comparison-head {
        display: grid;
        grid-template-columns:
            minmax(6rem, 1.65fr) repeat(2, minmax(0, 1fr)) minmax(0, 1.35fr) minmax(0, 0.7fr)
            1rem;
        gap: 0.5rem;
        align-items: baseline;
        padding: 0.8rem 0.6rem;
        text-align: right;
        overflow-wrap: anywhere;
    }
    .comparison-head {
        padding-block: 0.5rem;
    }
    .comparison-head :first-child,
    .player-name {
        text-align: left;
    }
    summary::-webkit-details-marker {
        display: none;
    }
    .ledger-row[open] > summary {
        background: var(--color-selected);
    }
    .ledger-row[open] .chevron {
        transform: rotate(180deg);
    }
    .chevron {
        align-self: center;
    }
    .metric-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
    }
    @container (max-width: 32rem) {
        .comparison-head {
            display: none;
        }
        .ledger-row {
            border-top: 1px solid var(--color-line);
            border-bottom: 0;
        }
        .comparison-row {
            grid-template-columns: repeat(2, minmax(0, 1fr)) 1rem;
            gap: 0.25rem 0.55rem;
            text-align: left;
        }
        .player-name {
            grid-column: 1 / 3;
        }
        .chevron {
            grid-column: 3;
            grid-row: 1;
        }
        .comparison-row > span:nth-child(even) {
            grid-column: 1;
        }
        .metric-label {
            margin-inline-end: 0.3rem;
            position: static;
            width: auto;
            height: auto;
            clip-path: none;
            font-weight: 400;
            font-size: 0.75rem;
            color: var(--color-muted);
        }
    }
    @media (prefers-reduced-motion: no-preference) {
        .ledger-row[open] .transactions {
            animation: reveal 0.16s ease-out;
        }
        @keyframes reveal {
            from {
                transform: translateY(-0.2rem);
                opacity: 0.75;
            }
        }
    }
</style>
