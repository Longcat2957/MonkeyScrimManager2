<script module lang="ts">
    export type LeaderboardSortKey =
        'games' | 'kda' | 'winRate' | 'csPerMin' | 'damagePerMin' | 'visionPerGame' | 'killParticipation';
</script>

<script lang="ts">
    import { untrack } from 'svelte';
    import { resolve } from '$app/paths';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import { fixed, percent, integer } from '#lib/features/players/format.ts';
    import type { StatsLeaderboardRow } from '#lib/features/stats/types.ts';

    type Row = StatsLeaderboardRow;
    type SortKey = LeaderboardSortKey;

    // 사용자별 지표 표. 열 머리를 누르면 그 지표로 정렬하고, 다시 누르면 방향을 바꾼다.
    let {
        rows,
        guildId,
        seasonId = null,
        contextKey,
        sortKey = $bindable<SortKey>('kda'),
        descending = $bindable(true)
    }: {
        rows: Row[];
        guildId: string;
        seasonId?: string | null;
        contextKey: string;
        sortKey?: SortKey;
        descending?: boolean;
    } = $props();

    const COLUMNS: { key: SortKey; label: string }[] = [
        { key: 'kda', label: 'KDA' },
        { key: 'winRate', label: '승률' },
        { key: 'games', label: '게임' },
        { key: 'killParticipation', label: '킬 관여' },
        { key: 'csPerMin', label: 'CS/분' },
        { key: 'damagePerMin', label: '피해/분' },
        { key: 'visionPerGame', label: '시야' }
    ];

    const PAGE_SIZE = 20;
    const PODIUM = ['bg-medal-gold/10', 'bg-medal-silver/10', 'bg-medal-bronze/10'];
    let current = $state(1);
    let sortMessage = $state('');
    let previousContext = '';
    const id = $props.id();
    // 같은 조건의 최신 행은 쪽·정렬을 유지하고 줄어든 마지막 쪽만 보정한다.
    $effect(() => {
        const key = contextKey;
        const last = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        untrack(() => {
            current = key === previousContext ? Math.min(current, last) : 1;
            previousContext = key;
        });
    });

    const value = (row: Row, key: SortKey) => (key === 'winRate' ? row.wins / row.games : row[key]);
    const sorted = $derived(
        [...rows].sort((a, b) => {
            const left = value(a, sortKey),
                right = value(b, sortKey);
            if (left === null) return right === null ? 0 : 1;
            if (right === null) return -1;
            return (right - left) * (descending ? 1 : -1);
        })
    );

    function sortBy(key: SortKey) {
        current = 1;
        if (sortKey === key) descending = !descending;
        else {
            sortKey = key;
            descending = true;
        }
        sortMessage = `${COLUMNS.find((column) => column.key === key)?.label} ${descending ? '높은' : '낮은'} 순으로 정렬했어요`;
    }

    // 키보드로 도달한 열 머리가 고정 이름 열이나 표의 오른쪽 경계에 가려지지 않게 한다.
    function revealColumn(event: FocusEvent) {
        if (event.target instanceof HTMLButtonElement) {
            event.target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
    }
</script>

<p id={`${id}-hint`} class="px-3 py-2 text-xs text-muted xl:hidden">
    표를 가로로 스크롤해 모든 지표를 확인하세요.
</p>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (가로 표의 스크롤 영역에 키보드 진입점을 제공한다.) -->
<div
    role="region"
    aria-labelledby={id}
    aria-describedby={`${id}-hint`}
    tabindex="0"
    class="relative overflow-x-auto scroll-ps-[9.5rem] scroll-pe-2 sm:scroll-ps-[12.5rem]"
>
    <table class="data-table min-w-[44rem] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <caption {id} class="sr-only">사용자별 지표</caption>
        <thead class="text-xs" onfocusin={revealColumn}>
            <tr class="border-b border-line">
                <th scope="col" class="w-10 px-2 py-2 text-right lg:w-12 lg:px-3 font-medium text-muted"
                    >순위</th
                >
                <th
                    scope="col"
                    class="sticky left-0 z-20 w-36 min-w-36 max-w-36 bg-surface-2 px-3 py-2 text-left font-medium text-muted sm:w-48 sm:min-w-48 sm:max-w-48"
                    >사용자</th
                >
                {#each COLUMNS as column (column.key)}
                    <th
                        scope="col"
                        class="px-1 py-1 text-right font-medium"
                        aria-sort={sortKey === column.key
                            ? descending
                                ? 'descending'
                                : 'ascending'
                            : undefined}
                    >
                        <button
                            type="button"
                            class={[
                                'inline-flex min-h-9 min-w-9 w-full items-center justify-end gap-1 rounded-(--radius-small) px-2 hover:bg-surface-hover pointer-coarse:min-h-11 pointer-coarse:min-w-11',
                                sortKey === column.key ? 'font-semibold text-nexus' : 'text-muted'
                            ]}
                            onclick={() => sortBy(column.key)}
                        >
                            {column.label}
                            <svg
                                aria-hidden="true"
                                width="10"
                                height="12"
                                viewBox="0 0 10 12"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                            >
                                {#if sortKey !== column.key || !descending}<path d="m2 5 3-3 3 3" />{/if}
                                {#if sortKey !== column.key || descending}<path d="m2 7 3 3 3-3" />{/if}
                            </svg>
                        </button>
                    </th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) as row, offset (row.identityKey ?? row.userId)}
                {@const index = (current - 1) * PAGE_SIZE + offset}
                <!-- 1~3위는 행 바탕으로 구분하고, 순위 숫자로도 같은 정보를 준다. -->
                <tr
                    class={[
                        'border-b border-line last:border-b-0',
                        value(row, sortKey) !== null && PODIUM[index]
                    ]}
                >
                    <td class="px-2 py-2.5 text-right font-semibold tabular-nums lg:px-3"
                        >{value(row, sortKey) === null ? '—' : index + 1}</td
                    >
                    <th
                        scope="row"
                        class="sticky left-0 z-10 w-36 min-w-36 max-w-36 bg-surface px-3 py-1 text-left font-normal sm:w-48 sm:min-w-48 sm:max-w-48"
                    >
                        <div class="flex min-w-0 flex-col">
                            <a
                                href={`${resolve('/g/[guildId]/players/[userId]', {
                                    guildId,
                                    userId: row.userId
                                })}${seasonId ? `?season=${seasonId}` : ''}`}
                                class="flex min-h-9 min-w-0 flex-1 items-center gap-2 hover:text-nexus hover:underline pointer-coarse:min-h-11"
                            >
                                <PlayerFace name={row.displayName} imageUrl={row.iconUrl} size="sm" />
                                <span class="min-w-0 font-semibold leading-5 whitespace-normal wrap-anywhere"
                                    >{row.displayName}</span
                                >
                            </a>
                            {#if row.badges.length}
                                <ul aria-label="1위 업적" class="hidden flex-wrap gap-x-2 pl-8 sm:flex">
                                    {#each row.badges as badge (badge.id)}
                                        <li class="text-micro font-medium whitespace-normal text-role-gold">
                                            {badge.title}
                                        </li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>
                    </th>
                    <td class="px-3 py-2.5 text-right tabular-nums">
                        <span class="block font-semibold">{fixed(row.kda, 2)}</span>
                        <span class="hidden text-xs text-muted sm:block"
                            >{fixed(row.kills, 1)} / {fixed(row.deaths, 1)} / {fixed(row.assists, 1)}</span
                        >
                    </td>
                    <td class="px-3 py-2.5 text-right tabular-nums">
                        <span
                            class={[
                                'block font-semibold',
                                row.wins / row.games >= 0.5 ? 'text-success' : 'text-error'
                            ]}>{percent(row.wins / row.games)}</span
                        >
                        <span class="hidden text-xs text-muted sm:block"
                            >{row.wins}승 {row.games - row.wins}패</span
                        >
                    </td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{row.games}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{percent(row.killParticipation)}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fixed(row.csPerMin, 1)}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{integer(row.damagePerMin)}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fixed(row.visionPerGame, 1)}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
<p role="status" class="sr-only">{sortMessage}</p>
<PageNav
    total={rows.length}
    pageSize={PAGE_SIZE}
    {current}
    onchange={(next) => (current = next)}
    label="리더보드 쪽 이동"
/>
