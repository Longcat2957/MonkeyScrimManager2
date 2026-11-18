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

    const COLUMNS = '@min-[42rem]:grid-cols-[minmax(0,1.6fr)_3rem_4rem_minmax(0,.7fr)_5.5rem_1rem]';
</script>

<!-- 진행 중·종료를 각각 머리 줄과 열 제목이 있는 표로 나눈다. 행 전체가 경기 상세 링크다. -->
<section aria-labelledby={id} class="panel @container overflow-hidden">
    <header class="panel-bar">
        <h2 {id} class="font-bold">{title}</h2>
        <span class="text-xs font-medium text-muted tabular-nums">{count}경기</span>
    </header>

    {#if matches.length === 0}
        <p class="px-4 py-8 text-center text-sm text-muted">{emptyMessage}</p>
    {:else}
        <div
            aria-hidden="true"
            class={[
                'hidden items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted @min-[42rem]:grid',
                COLUMNS
            ]}
        >
            <span>경기</span><span>형식</span><span class="text-center">스코어</span><span>결과</span><span
                >날짜</span
            ><span></span>
        </div>
        <ul class="divide-y divide-line">
            {#each matches as match (match.id)}
                {@const winner = winnerOf(match)}
                {@const status = MATCH_STATUS[match.status]}
                {@const date = match.playedAt ? formatShortDate(match.playedAt) : '날짜 미확인'}
                <li>
                    <a
                        href={hrefFor(match)}
                        class={[
                            'grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-offset-[-2px]',
                            COLUMNS
                        ]}
                    >
                        <span class="flex min-w-0 flex-col gap-0.5">
                            <!-- 팀 이름은 각각 줄이고 vs는 항상 보이게 둔다. 승자는 결과 열 한 곳에서만 표시한다. -->
                            <span
                                class="grid grid-cols-[minmax(0,max-content)_auto_minmax(0,max-content)] items-baseline justify-start gap-1.5 text-ui font-semibold"
                            >
                                <span class="truncate">{match.teamA}</span>
                                <span class="text-micro font-normal text-muted">vs</span>
                                <span class="truncate">{match.teamB}</span>
                            </span>
                            <span class="truncate text-xs text-muted">
                                {match.scrimTitle}<span class="@min-[42rem]:hidden"
                                    >{` · BO${match.bestOf} · ${date}`}</span
                                >
                            </span>
                        </span>

                        <span class="hidden text-ui text-ink-2 @min-[42rem]:block"
                            ><span class="sr-only">형식 </span>BO{match.bestOf}</span
                        >

                        <span class="whitespace-nowrap text-center text-base font-bold tabular-nums">
                            <span class="sr-only">스코어 </span>{match.scoreA} : {match.scoreB}
                        </span>

                        <span
                            class="col-span-2 flex min-w-0 items-center gap-1.5 text-ui @min-[42rem]:col-span-1"
                        >
                            {#if winner}
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    class="size-3.5 shrink-0 text-role-gold"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path
                                        d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22m7-7.34V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0z"
                                    /></svg
                                >
                                <span class="truncate font-medium"
                                    ><span class="sr-only">승리 </span>{winner === 'a'
                                        ? match.teamA
                                        : match.teamB}</span
                                >
                            {:else}
                                <StatusTag text={status.text} state={status.state} />
                            {/if}
                        </span>

                        <span class="hidden text-xs text-muted @min-[42rem]:block">{date}</span>

                        <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            class="hidden size-4 text-muted @min-[42rem]:block"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"><path d="m9 18 6-6-6-6" /></svg
                        >
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
    {@render footer?.()}
</section>
