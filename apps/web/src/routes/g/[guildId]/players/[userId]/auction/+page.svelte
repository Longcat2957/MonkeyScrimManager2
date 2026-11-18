<script lang="ts">
    import { resolve } from '$app/paths';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SeasonSelector from '#lib/components/common/SeasonSelector.svelte';
    import { formatSchedule } from '#lib/features/labels.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const points = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    const point = (value: number) => `${points.format(value)}P`;
    const share = (price: number, budget: number) => `${points.format((100 * price) / budget)}%`;
    function replay(auctionId: string, signingId?: string) {
        const query = new URLSearchParams({ auction: auctionId });
        if (data.selectedSeasonId) query.set('season', data.selectedSeasonId);
        const hash = signingId ? `#signing-${encodeURIComponent(signingId)}` : '';
        return `${resolve('/g/[guildId]/stats/auction', { guildId: page.params.guildId! })}?${query}${hash}`;
    }
</script>

<svelte:head>
    <title>{data.player.name} 경매 기록 | {SERVICE_NAME}</title>
</svelte:head>

<div class="@container grid min-w-0 gap-8" aria-busy={navigating.to?.route.id === page.route.id}>
    <header class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div class="flex min-w-0 max-w-full items-center gap-3">
            <PlayerFace name={data.player.name} imageUrl={data.player.iconUrl} size="lg" />
            <h1 class="min-w-0 text-title font-bold wrap-anywhere">{data.player.name}의 경매 기록</h1>
        </div>
        <SeasonSelector seasons={data.seasons} selectedSeasonId={data.selectedSeasonId} />
    </header>

    <section aria-labelledby="receipts" class="min-w-0">
        <h2 id="receipts" class="mb-3 text-lg font-bold">선수 낙찰·배정 내역</h2>
        {#if data.prices && data.prices.count > 1}
            <dl class="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-ui tabular-nums">
                <div>
                    <dt>유상 낙찰</dt>
                    <dd>{data.prices.count}회</dd>
                </div>
                <div>
                    <dt>평균</dt>
                    <dd>{point(data.prices.average)}</dd>
                </div>
                <div>
                    <dt>중앙값</dt>
                    <dd>{point(data.prices.median)}</dd>
                </div>
                <div>
                    <dt>범위</dt>
                    <dd>{point(data.prices.min)} ~ {point(data.prices.max)}</dd>
                </div>
            </dl>
        {/if}
        {#if data.receipts.length}
            <ol class="divide-y divide-line border-y border-line">
                {#each data.receipts as entry (entry.id)}
                    <li
                        class="grid min-w-0 gap-x-5 gap-y-1.5 py-4 @min-[32rem]:grid-cols-[minmax(7rem,auto)_1fr_auto] @min-[32rem]:items-baseline"
                    >
                        <strong class="text-lg tabular-nums"
                            >{entry.price === null ? '수동 배정' : point(entry.price)}</strong
                        >
                        <div class="grid min-w-0 gap-1 wrap-anywhere">
                            <p class="font-semibold">{entry.title}</p>
                            <p class="text-ui">
                                {entry.teamName}{#if entry.price !== null}
                                    · 구매자 {entry.buyer ?? '미확인'}{/if}
                            </p>
                            {#if entry.price !== null}
                                <p class="text-xs text-muted tabular-nums">
                                    시작 예산 {point(entry.budget)}{#if entry.budget > 0}의 {share(
                                            entry.price,
                                            entry.budget
                                        )}{/if}
                                </p>
                            {/if}
                            {#if entry.acquiredAt}
                                <time class="text-xs text-muted" datetime={entry.acquiredAt}
                                    >{formatSchedule(entry.acquiredAt)}</time
                                >
                            {/if}
                        </div>
                        <a
                            class="ledger-link"
                            href={replay(entry.auctionId, entry.id)}
                            aria-label={`${entry.title} 경매 리플레이`}>경매 리플레이</a
                        >
                    </li>
                {/each}
            </ol>
        {:else}
            <p class="border-t border-line py-4 text-ui text-muted">
                이 시즌에 선수로 낙찰되거나 배정된 기록이 없어요.
            </p>
        {/if}
    </section>

    {#if data.teams.length}
        <section aria-labelledby="teams" class="min-w-0">
            <h2 id="teams" class="mb-3 text-lg font-bold">팀장으로 꾸린 팀</h2>
            <div class="divide-y divide-line border-y border-line">
                {#each data.teams as team, index (team.id)}
                    <details open={index === 0}>
                        <summary class="cursor-pointer py-3 text-ink marker:text-muted hover:bg-surface-2">
                            <strong class="wrap-anywhere">{team.teamName}</strong>
                            <span class="ml-2 text-ui wrap-anywhere text-muted">{team.title}</span>
                        </summary>
                        <div
                            class="team-sheet grid min-w-0 gap-4 border-t border-dashed border-line bg-surface px-3 py-4 @min-[45rem]:grid-cols-[minmax(12rem,1fr)_minmax(15rem,1.4fr)] @min-[45rem]:gap-8 @min-[45rem]:px-5"
                        >
                            <div class="min-w-0">
                                <dl class="grid gap-2 text-ui wrap-anywhere tabular-nums">
                                    <div>
                                        <dt>시작 예산</dt>
                                        <dd>{point(team.budget)}</dd>
                                    </div>
                                    <div>
                                        <dt>총지출</dt>
                                        <dd>{point(team.spent)}</dd>
                                    </div>
                                    <div>
                                        <dt>잔액</dt>
                                        <dd>{point(team.remaining)}</dd>
                                    </div>
                                    {#if team.largest}
                                        <div>
                                            <dt>최고가 영입</dt>
                                            <dd>
                                                {team.largest.name} · {point(
                                                    team.largest.price
                                                )}{#if team.budget > 0}
                                                    <span class="font-normal text-muted"
                                                        >(예산의 {share(
                                                            team.largest.price,
                                                            team.budget
                                                        )})</span
                                                    >{/if}
                                            </dd>
                                        </div>
                                    {/if}
                                </dl>
                                <a
                                    class="ledger-link mt-3"
                                    href={replay(team.auctionId)}
                                    aria-label={`${team.title} 경매 리플레이`}>경매 리플레이</a
                                >
                            </div>
                            <div class="min-w-0">
                                <h3 class="mb-1 text-ui font-semibold">팀 명단</h3>
                                <ul class="divide-y divide-line text-ui">
                                    {#if team.captain}
                                        <li class="flex items-center gap-2 py-2">
                                            <PlayerFace
                                                name={team.captain.name}
                                                imageUrl={team.captain.avatarUrl}
                                                size="xs"
                                            />
                                            <span class="min-w-0 wrap-anywhere">{team.captain.name}</span>
                                            <span class="ml-auto shrink-0 text-muted">팀장</span>
                                        </li>
                                    {/if}
                                    {#each team.roster as member (member.id)}
                                        <li class="flex items-center gap-2 py-2 tabular-nums">
                                            <span class="shrink-0 text-xs text-muted">{member.order}번째</span
                                            >
                                            <PlayerFace
                                                name={member.player.name}
                                                imageUrl={member.player.avatarUrl}
                                                size="xs"
                                            />
                                            <span class="min-w-0 wrap-anywhere">
                                                {member.player.name}
                                                {#if member.price !== null && member.buyer?.id !== team.captain?.id}
                                                    <small class="flex items-center gap-1 text-muted">
                                                        {#if member.buyer}
                                                            <PlayerFace
                                                                name={member.buyer.name}
                                                                imageUrl={member.buyer.avatarUrl}
                                                                size="xs"
                                                            />
                                                        {/if}
                                                        <span>낙찰 팀장 {member.buyer?.name ?? '미확인'}</span
                                                        >
                                                    </small>
                                                {/if}
                                            </span>
                                            <strong class="ml-auto shrink-0 font-semibold"
                                                >{member.price === null
                                                    ? '수동 배정'
                                                    : point(member.price)}</strong
                                            >
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        </div>
                    </details>
                {/each}
            </div>
            {#if data.repeated.length}
                <h3 class="mt-5 mb-2 text-ui font-bold">여러 경매에서 다시 영입한 선수</h3>
                <ul class="divide-y divide-line text-ui">
                    {#each data.repeated as recruit (recruit.player.id)}
                        <li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                            <strong class="flex min-w-0 items-center gap-2 wrap-anywhere">
                                <PlayerFace
                                    name={recruit.player.name}
                                    imageUrl={recruit.player.avatarUrl}
                                    size="xs"
                                />
                                <span class="min-w-0">
                                    {recruit.player.name}
                                    <span class="text-muted">{recruit.receipts.length}회</span>
                                </span>
                            </strong>
                            {#each recruit.receipts as receipt (receipt.id)}
                                <a href={replay(receipt.auctionId, receipt.id)} class="ledger-link"
                                    >{receipt.title} · {point(receipt.price)}</a
                                >
                            {/each}
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/if}
</div>

<style>
    dt {
        display: inline;
        color: var(--color-muted);
    }
    dd {
        display: inline;
        margin-inline-start: 0.4rem;
        font-weight: 600;
    }
    .ledger-link {
        display: inline-block;
        width: fit-content;
        max-width: 100%;
        padding-block: 0.25rem;
        color: var(--color-nexus);
        font-size: 0.8125rem;
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 0.2em;
        overflow-wrap: anywhere;
    }
    @media (prefers-reduced-motion: no-preference) {
        details[open] > .team-sheet {
            animation: unfold 150ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes unfold {
            from {
                transform: translateY(-0.2rem);
                opacity: 0.8;
            }
        }
    }
</style>
