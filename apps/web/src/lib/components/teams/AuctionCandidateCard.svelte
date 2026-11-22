<script lang="ts">
    import { flushSync, onDestroy, type Snippet } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        formatMmr,
        formatSoloRank,
        winRate,
        type AuctionView,
        type FormationPlayer
    } from '#lib/features/scrims/formation.ts';
    import AuctionTargetProfile from './AuctionTargetProfile.svelte';
    import type { DragState } from './drag.svelte.ts';

    let {
        player,
        profile,
        price,
        controls,
        drag,
        timer,
        passAction,
        height = $bindable(0)
    }: {
        player: FormationPlayer;
        profile: AuctionView['openProfile'];
        price: AuctionView['openPriceHistory'];
        controls: boolean;
        drag: DragState;
        timer: Snippet;
        passAction: Snippet;
        height?: number;
    } = $props();

    let details = $state(false);
    let summary: HTMLDivElement;
    let turn: Animation | undefined;
    const lane = $derived(player.positions[0] ?? profile?.mainLane);
    const laneName = $derived(POSITIONS.find((position) => position.key === lane)?.text);
    const points = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

    function flip() {
        turn?.cancel();
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            details = !details;
            return;
        }

        const edge = details ? -88 : 88;
        const rotate = (degrees: number) => `perspective(65rem) rotateY(${degrees}deg)`;
        turn = summary.animate([{ transform: rotate(0) }, { transform: rotate(edge) }], {
            delay: 80,
            duration: 160 / 1.5,
            easing: 'ease-in',
            fill: 'forwards'
        });
        turn.onfinish = () => {
            turn?.cancel();
            flushSync(() => (details = !details));
            turn = summary.animate([{ transform: rotate(-edge) }, { transform: rotate(0) }], {
                duration: 240 / 1.5,
                easing: 'ease-out'
            });
        };
    }

    onDestroy(() => turn?.cancel());
</script>

{#snippet priceSummary()}
    {#if price}
        <span class="text-ink-2">역대 평균 낙찰가</span>
        <span class="inline-flex items-baseline gap-2 whitespace-nowrap tabular-nums">
            <strong class="text-lg leading-none">{points.format(price.average)}P</strong>
            <span class="text-xs text-muted">({price.count}회)</span>
        </span>
    {:else}
        <span class="text-muted">유상 낙찰 기록 없음</span>
    {/if}
{/snippet}

<div
    class="sticky top-(--app-header-height) z-20 mx-2 overflow-clip rounded-box xl:relative xl:top-auto xl:z-auto xl:mx-0"
>
    <!-- 운영자는 이 카드를 팀 패널로 끌어 가격 없이 배치할 수 있다. -->
    <div
        bind:this={summary}
        bind:clientHeight={height}
        role="group"
        aria-label={`현재 매물 ${player.displayName}`}
        draggable={controls && !details}
        ondragstart={(event) => drag.start(event, player.participantId)}
        ondragend={() => drag.end()}
        class={[
            'summary panel relative flex h-full flex-col gap-2 overflow-hidden bg-selected px-3 py-2 xl:min-h-92 xl:p-4',
            controls && !details && 'cursor-grab active:cursor-grabbing',
            drag.id === player.participantId ? 'border-nexus opacity-70' : 'border-nexus/40'
        ]}
    >
        {#if controls}{@render timer()}{/if}
        <div class="relative grid min-w-0 flex-1 content-between gap-3" class:show-back={details}>
            <div class="flex min-w-0 items-center gap-3">
                <div class="portrait">
                    <PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="lg" />
                </div>
                <div class="min-w-0">
                    <p class="player-name text-xl leading-tight font-bold tracking-tight wrap-anywhere">
                        {player.displayName}
                    </p>
                    <div class="badges flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        <span class="inline-flex items-center gap-1 text-role-gold">
                            {#if lane}<PositionIcon position={lane} size="sm" />{player.positions.length
                                    ? '희망'
                                    : '주력'}
                                {laneName}{:else}포지션 미확인{/if}
                        </span>
                    </div>
                    {#if profile?.riot?.pending}
                        <p class="mt-1 text-xs text-muted">Riot 전적 갱신 중</p>
                    {/if}
                </div>
            </div>
            {#if profile?.riot?.rank}
                {@const rank = profile.riot.rank}
                <dl aria-label="솔로랭크" class="grid grid-cols-2 gap-x-3 tabular-nums">
                    <div>
                        <dt class="text-xs text-muted">현재 티어</dt>
                        <dd class="mt-0.5 text-sm font-semibold">
                            {rank.current ? formatSoloRank(rank.current) : '배치 전'}
                        </dd>
                    </div>
                    <div>
                        <dt class="text-xs text-muted">최고 티어</dt>
                        <dd class="mt-0.5 text-sm font-semibold">
                            {rank.peak ? formatSoloRank(rank.peak) : '기록 없음'}
                        </dd>
                    </div>
                </dl>
            {/if}
            <dl class="stats flex divide-x divide-line-strong border-t border-line pt-3 tabular-nums">
                <div>
                    <dt>MMR</dt>
                    <dd>{formatMmr(lane ? player.mmr[lane] : null)}</dd>
                </div>
                {#if profile?.summary?.games}
                    <div>
                        <dt>시즌 전적</dt>
                        <dd>{profile.summary.wins}승 {profile.summary.losses}패</dd>
                    </div>
                    <div>
                        <dt>승률</dt>
                        <dd>{winRate(profile.summary.games, profile.summary.wins)}</dd>
                    </div>
                {/if}
            </dl>
            {#if profile?.championRecords.length}
                <div class="hidden border-t border-line pt-3 xl:block">
                    <h4 class="text-xs font-semibold text-ink-2">내전 주력 챔피언</h4>
                    <ul class="mt-2 divide-y divide-line">
                        {#each profile.championRecords.slice(0, 3) as record (record.champion.id)}
                            <li class="flex min-w-0 items-center gap-2 py-1 text-ui">
                                {#if record.champion.iconUrl}<img
                                        class="size-6 shrink-0 rounded-small"
                                        src={record.champion.iconUrl}
                                        alt=""
                                        draggable="false"
                                    />{/if}
                                <span class="min-w-0 flex-1 font-semibold wrap-anywhere"
                                    >{record.champion.name}</span
                                >
                                <span class="shrink-0 text-xs text-muted tabular-nums"
                                    >{record.games}게임</span
                                >
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
            {#if details}
                <div class="back absolute inset-0 flex flex-col overflow-hidden">
                    <AuctionTargetProfile {player} {profile} {priceSummary} />
                </div>
            {/if}
        </div>
    </div>
</div>
<!-- 유찰은 현재 매물 칸 하단에 고정해 카드 길이와 상관없이 같은 자리에 둔다. -->
<div class="flex items-center gap-2 bg-surface px-3 pt-2 pb-3 xl:-mx-2 xl:-mb-2">
    <Button
        size="sm"
        variant="quiet"
        aria-expanded={details}
        aria-controls={details ? 'auction-target-profile' : undefined}
        onclick={flip}
    >
        {details ? '상세 접기' : '상세 보기'}
    </Button>
    {#if controls}{@render passAction()}{/if}
</div>

<style>
    .portrait {
        flex: none;
        pointer-events: none;
    }
    .badges {
        margin-top: 0.25rem;
    }
    .show-back > :not(.back) {
        visibility: hidden;
    }
    .stats > div {
        flex: 1;
        min-width: 0;
        padding-inline: 0.75rem;
    }
    .stats > :first-child {
        padding-inline-start: 0;
    }
    .stats > :nth-child(2) {
        flex-grow: 1.5;
    }
    .stats > :last-child {
        padding-inline-end: 0;
    }
    .stats dt {
        font-size: 0.75rem;
        color: var(--color-muted);
    }
    .stats dd {
        margin-top: 0.125rem;
        font-size: 1.125rem;
        line-height: 1.25;
        font-weight: 700;
    }
    @media (width >= 80rem) {
        .portrait :global(:first-child) {
            width: 4.5rem;
            height: 4.5rem;
        }
    }

    @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
        .summary::after {
            content: '';
            position: absolute;
            inset: auto 0 0 auto;
            width: 1.5rem;
            aspect-ratio: 1;
            pointer-events: none;
            background: linear-gradient(
                135deg,
                transparent 48%,
                var(--color-nexus) 51%,
                var(--color-surface) 85%
            );
            transform: scale(0);
            transform-origin: bottom right;
            transition: transform 160ms ease-out;
        }
        .summary:hover::after {
            transform: scale(1);
        }
    }
</style>
