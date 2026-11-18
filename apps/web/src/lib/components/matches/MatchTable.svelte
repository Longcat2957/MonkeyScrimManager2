<script lang="ts">
    import type { Snippet } from 'svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { formatShortDate, MATCH_STATUS } from '#lib/features/labels.ts';
    import type { MatchListItem } from '#lib/features/matches/types.ts';

    type Props = {
        id: string;
        title: string;
        count: number;
        matches: MatchListItem[];
        emptyMessage: string;
        hrefFor: (match: MatchListItem) => string;
        // 표 아래에 붙일 내용(쪽 이동 등)
        footer?: Snippet;
    };

    let { id, title, count, matches, emptyMessage, hrefFor, footer }: Props = $props();

    // 정상 종료한 시리즈만 승자를 정한다. 중도 종료·진행 중에는 점수가 앞서도 승자가 아니다.
    function winnerOf(match: MatchListItem) {
        if (match.status !== 'completed' || match.scoreA === match.scoreB) return null;
        return match.scoreA > match.scoreB ? 'a' : 'b';
    }
</script>

<!-- 각 행에서 내전 문맥, 양 팀 점수, 경기 상태를 한 번에 읽는다. -->
<section aria-labelledby={id} class="@container min-w-0">
    <header class="flex items-baseline gap-2 border-b border-line-strong pb-2">
        <h2 {id} class="text-lg font-bold">{title}</h2>
        <span class="text-ui text-muted tabular-nums">{count}경기</span>
    </header>

    {#if matches.length === 0}
        <p class="px-4 py-8 text-center text-sm text-muted">{emptyMessage}</p>
    {:else}
        <ul class="divide-y divide-line border-b border-line">
            {#each matches as match (match.id)}
                {@const winner = winnerOf(match)}
                {@const status = MATCH_STATUS[match.status]}
                {@const date = match.playedAt ? formatShortDate(match.playedAt) : '날짜 미확인'}
                <li>
                    <a
                        href={hrefFor(match)}
                        class="ledger grid min-w-0 items-center gap-x-3 gap-y-2 px-2 py-3 text-ui hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:-outline-offset-2 @min-[40rem]:px-3"
                    >
                        <span class="min-w-0">
                            <span class="block break-words font-semibold">{match.scrimTitle}</span>
                            <span class="text-xs text-muted">{date} · BO{match.bestOf}</span>
                        </span>
                        <span
                            class="pair grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
                        >
                            <span class={['min-w-0 break-words text-right', winner === 'a' && 'font-bold']}>
                                {match.teamA}
                                {#if winner === 'a'}<small class="text-success">승</small>{/if}
                            </span>
                            <strong class="whitespace-nowrap font-brand text-lg tabular-nums">
                                <span class="sr-only">스코어 </span>{match.scoreA} : {match.scoreB}
                            </strong>
                            <span class={['min-w-0 break-words', winner === 'b' && 'font-bold']}>
                                {match.teamB}
                                {#if winner === 'b'}<small class="text-success">승</small>{/if}
                            </span>
                        </span>
                        <span class="flex items-center justify-end gap-1">
                            <StatusTag text={status.text} state={status.state} />
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                class="size-4 text-muted"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"><path d="m9 18 6-6-6-6" /></svg
                            >
                        </span>
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
    {@render footer?.()}
</section>

<style>
    .ledger {
        grid-template-columns: minmax(0, 1fr) auto;
    }
    .pair {
        grid-area: 2 / 1 / 3 / -1;
    }
    @container (min-width: 40rem) {
        .ledger {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) 5.5rem;
        }
        .pair {
            grid-area: auto;
        }
    }
</style>
