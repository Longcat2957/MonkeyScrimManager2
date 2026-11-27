<script lang="ts">
    import { scheduleParts } from '#lib/features/labels.ts';
    import type { MatchListItem } from '#lib/features/matches/types.ts';

    type Props = {
        count: number;
        matches: MatchListItem[];
        emptyMessage: string;
        hrefFor: (match: MatchListItem) => string;
    };

    let { count, matches, emptyMessage, hrefFor }: Props = $props();

    // 서버가 실제 시각, 없으면 내전 예정 시각의 최신순으로 정렬한다. 같은 날짜의 연속 행을 한 묶음으로 보여 준다.
    const groups = $derived.by(() => {
        const result: { label: string; rows: { match: MatchListItem; meta: string }[] }[] = [];
        for (const match of matches) {
            const iso = match.playedAt ?? match.scheduledAt ?? null;
            const parts = iso ? scheduleParts(iso) : null;
            const label = parts ? `${parts.month}월 ${parts.day}일 (${parts.weekday})` : '일정 없음';
            const meta = parts ? `BO${match.bestOf} · ${parts.time}` : `BO${match.bestOf}`;
            const last = result.at(-1);
            if (last?.label === label) last.rows.push({ match, meta });
            else result.push({ label, rows: [{ match, meta }] });
        }
        return result;
    });
</script>

{#snippet team(name: string, won: boolean, side: 'a' | 'b')}
    <span
        class={[
            'flex min-w-0 items-center gap-1.5',
            side === 'a' && 'justify-end text-right',
            won ? 'font-bold text-ink' : 'text-muted'
        ]}
    >
        {#if won && side === 'a'}<small class="win-chip">승</small>{/if}
        <span class="min-w-0 [overflow-wrap:anywhere]">{name}</span>
        {#if won && side === 'b'}<small class="win-chip">승</small>{/if}
    </span>
{/snippet}

<section aria-labelledby="done-matches" class="@container min-w-0">
    <header class="flex items-baseline gap-2 border-b border-line-strong pb-2">
        <h2 id="done-matches" class="text-lg font-bold">완료된 경기</h2>
        <span class="text-ui text-muted tabular-nums">{count}</span>
        <span class="ml-auto text-xs text-muted">최신순</span>
    </header>

    {#if matches.length === 0}
        <p class="px-4 py-8 text-center text-sm text-muted">{emptyMessage}</p>
    {:else}
        {#each groups as group, index (index)}
            <h3
                class="flex items-baseline gap-2 px-2 pt-4 pb-1.5 text-xs font-bold text-role-gold @min-[40rem]:px-3"
            >
                {group.label}
                <span class="font-medium text-muted tabular-nums">{group.rows.length}경기</span>
            </h3>
            <ul class="divide-y divide-line border-y border-line">
                {#each group.rows as { match, meta } (match.id)}
                    {@const winner = match.scoreA > match.scoreB ? 'a' : 'b'}
                    <li>
                        <a
                            href={hrefFor(match)}
                            class="ledger grid min-w-0 items-center gap-x-3 gap-y-1.5 px-2 py-2.5 text-sm hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:-outline-offset-2 @min-[40rem]:px-3"
                        >
                            <span
                                class="flex min-w-0 items-baseline gap-2 @min-[40rem]:flex-col @min-[40rem]:items-start @min-[40rem]:gap-0.5"
                            >
                                <span class="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]"
                                    >{match.scrimTitle}</span
                                >
                                <span class="whitespace-nowrap text-xs text-muted tabular-nums">{meta}</span>
                            </span>
                            <span
                                class="pair grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5"
                            >
                                {@render team(match.teamA, winner === 'a', 'a')}
                                <strong class="whitespace-nowrap font-brand text-lg tabular-nums">
                                    <span class="sr-only">스코어 </span><span
                                        class={winner === 'a' ? 'text-ink' : 'text-muted'}
                                        >{match.scoreA}</span
                                    ><span aria-hidden="true" class="px-1 text-line-strong">:</span><span
                                        class="sr-only">대</span
                                    ><span class={winner === 'b' ? 'text-ink' : 'text-muted'}
                                        >{match.scoreB}</span
                                    >
                                </strong>
                                {@render team(match.teamB, winner === 'b', 'b')}
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
        {/each}
    {/if}
</section>

<style>
    .win-chip {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        border-radius: var(--radius-small);
        background: color-mix(in oklab, var(--color-success) 14%, transparent);
        padding: 0 0.375rem;
        color: var(--color-success);
        font-size: 0.6875rem;
        font-weight: 700;
        line-height: 1.125rem;
    }
    .ledger {
        grid-template-columns: minmax(0, 1fr) auto;
    }
    .pair {
        grid-area: 2 / 1;
    }
    .chevron {
        grid-area: 1 / 2 / 3 / 3;
    }
    @container (min-width: 40rem) {
        .ledger {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) 1rem;
        }
        .pair,
        .chevron {
            grid-area: auto;
        }
    }
</style>
