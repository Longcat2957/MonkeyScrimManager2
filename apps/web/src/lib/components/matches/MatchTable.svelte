<script lang="ts">
    import { formatShortDate } from '#lib/features/labels.ts';
    import type { MatchListItem } from '#lib/features/matches/types.ts';

    type Props = {
        count: number;
        matches: MatchListItem[];
        emptyMessage: string;
        hrefFor: (match: MatchListItem) => string;
    };

    let { count, matches, emptyMessage, hrefFor }: Props = $props();
</script>

<section aria-labelledby="done-matches" class="@container min-w-0">
    <header class="flex items-baseline gap-2 border-b border-line-strong pb-2">
        <h2 id="done-matches" class="text-lg font-bold">완료된 시리즈</h2>
        <span class="text-ui text-muted tabular-nums">{count}경기</span>
    </header>

    {#if matches.length === 0}
        <p class="px-4 py-8 text-center text-sm text-muted">{emptyMessage}</p>
    {:else}
        <ul class="divide-y divide-line border-b border-line">
            {#each matches as match (match.id)}
                {@const winner = match.scoreA > match.scoreB ? 'a' : 'b'}
                {@const date = match.playedAt ? formatShortDate(match.playedAt) : '날짜 미확인'}
                <li>
                    <a
                        href={hrefFor(match)}
                        class="ledger grid min-w-0 items-center gap-x-3 gap-y-1 px-2 py-2.5 text-sm hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:-outline-offset-2 @min-[40rem]:px-3"
                    >
                        <span class="min-w-0 font-semibold [overflow-wrap:anywhere]">{match.scrimTitle}</span>
                        <span
                            class="whitespace-nowrap text-right text-xs text-muted tabular-nums @min-[40rem]:text-left"
                            >{date} · BO{match.bestOf}</span
                        >
                        <span
                            class="pair grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
                        >
                            <span
                                class={[
                                    'min-w-0 text-right [overflow-wrap:anywhere]',
                                    winner === 'a' && 'font-bold'
                                ]}
                            >
                                {match.teamA}
                                {#if winner === 'a'}<small class="text-success">승</small>{/if}
                            </span>
                            <strong class="whitespace-nowrap font-brand text-lg tabular-nums">
                                <span class="sr-only">스코어 </span>{match.scoreA} : {match.scoreB}
                            </strong>
                            <span class={['min-w-0 [overflow-wrap:anywhere]', winner === 'b' && 'font-bold']}>
                                {match.teamB}
                                {#if winner === 'b'}<small class="text-success">승</small>{/if}
                            </span>
                        </span>
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            class="chevron size-4 justify-self-end text-muted"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"><path d="m9 18 6-6-6-6" /></svg
                        >
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
</section>

<style>
    .ledger {
        grid-template-columns: minmax(0, 1fr) auto;
    }
    .pair {
        grid-area: 2 / 1 / 3 / -1;
        padding-inline: 1rem;
    }
    .chevron {
        grid-area: 2 / 2;
    }
    @container (min-width: 40rem) {
        .ledger {
            grid-template-columns: minmax(0, 1fr) 8rem minmax(0, 1.35fr) 1rem;
        }
        .pair {
            grid-area: auto;
            padding-inline: 0;
        }
        .chevron {
            grid-area: auto;
        }
    }
</style>
