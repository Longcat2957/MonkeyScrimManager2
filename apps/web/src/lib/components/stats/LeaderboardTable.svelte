<script lang="ts">
	import { resolve } from '$app/paths';
	import PageNav from '#lib/components/common/PageNav.svelte';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import type { AchievementBadge } from '#lib/features/players/achievements.ts';
	import { fixed, percent, integer } from '#lib/features/players/format.ts';
	import type { PlayerSummary } from '#lib/features/players/types.ts';

	type Row = PlayerSummary & { userId: string; displayName: string; iconUrl: string | null; badges: AchievementBadge[] };
	type SortKey = 'games' | 'kda' | 'winRate' | 'csPerMin' | 'damagePerMin' | 'visionPerGame' | 'killParticipation';

	// 사용자별 지표 표. 열 머리를 누르면 그 지표로 정렬하고, 다시 누르면 방향을 바꾼다.
	let { rows, guildId }: { rows: Row[]; guildId: string } = $props();

	const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
		{ key: 'games', label: '게임', className: 'hidden md:table-cell' },
		{ key: 'kda', label: 'KDA' },
		{ key: 'winRate', label: '승률' },
		{ key: 'killParticipation', label: '킬 관여', className: 'hidden md:table-cell' },
		{ key: 'csPerMin', label: 'CS/분', className: 'hidden lg:table-cell' },
		{ key: 'damagePerMin', label: '피해/분', className: 'hidden lg:table-cell' },
		{ key: 'visionPerGame', label: '시야', className: 'hidden lg:table-cell' }
	];

	const PAGE_SIZE = 20;
	const PODIUM = ['bg-warning/15', 'bg-text-primary/5 dark:bg-text-dark/10', 'bg-warning/5'];
	let sortKey = $state<SortKey>('kda');
	let descending = $state(true);
	let current = $state(1);
	// 조건이 바뀌어 행이 달라지면 첫 쪽으로 돌아간다.
	$effect(() => {
		void rows;
		current = 1;
	});

	const value = (row: Row, key: SortKey) => (key === 'winRate' ? row.wins / row.games : row[key]);
	const sorted = $derived([...rows].sort((a, b) => {
		const left = value(a, sortKey), right = value(b, sortKey);
		if (left === null) return right === null ? 0 : 1;
		if (right === null) return -1;
		return (right - left) * (descending ? 1 : -1);
	}));

	function sortBy(key: SortKey) {
		current = 1;
		if (sortKey === key) descending = !descending;
		else {
			sortKey = key;
			descending = true;
		}
	}
</script>

<div class="relative overflow-x-auto rounded-(--radius-box) border border-border bg-bg-surface dark:bg-bg-surface-dark">
	<table class="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
		<caption class="sr-only">리더보드, {COLUMNS.find((column) => column.key === sortKey)?.label} {descending ? '높은' : '낮은'} 순</caption>
		<thead class="text-xs">
			<tr class="border-b border-border">
				<th scope="col" class="w-10 px-2 py-2 text-right lg:w-12 lg:px-3 font-medium opacity-60">순위</th>
				<th scope="col" class="px-3 py-2 text-left font-medium opacity-60">사용자</th>
				{#each COLUMNS as column (column.key)}
					<th scope="col" class={['px-1 py-1 text-right font-medium', column.className]} aria-sort={sortKey === column.key ? (descending ? 'descending' : 'ascending') : 'none'}>
						<button
							type="button"
							class={['inline-flex min-h-9 items-center gap-1 rounded-(--radius-small) px-2 hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark', sortKey === column.key ? 'font-semibold text-primary dark:text-dark' : 'opacity-60']}
							onclick={() => sortBy(column.key)}
						>
							{column.label}<span aria-hidden="true" class="text-[0.625rem]">{sortKey === column.key ? (descending ? '▼' : '▲') : '↕'}</span>
						</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) as row, offset (row.userId)}
				{@const index = (current - 1) * PAGE_SIZE + offset}
				<!-- 1~3위는 행 바탕으로 구분하고, 순위 숫자로도 같은 정보를 준다. -->
				<tr class={['border-b border-border last:border-b-0', value(row, sortKey) !== null && PODIUM[index]]}>
					<td class="px-2 py-2.5 text-right font-semibold tabular-nums lg:px-3">{value(row, sortKey) === null ? '—' : index + 1}</td>
					<td class="w-full max-w-0 min-w-28 px-3 py-2.5">
						<div class="flex min-w-0 items-center gap-2">
							<a href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: row.userId })} class="flex min-w-0 items-center gap-3 hover:underline">
								<PlayerFace name={row.displayName} imageUrl={row.iconUrl} />
								<span class="truncate font-semibold">{row.displayName}</span>
							</a>
							{#if row.badges.length}
								<ul aria-label="1위 업적" class="hidden shrink-0 gap-1 sm:flex">
									{#each row.badges as badge (badge.id)}
										<li title={badge.title} class="flex size-6 items-center justify-center rounded-(--radius-small) bg-bg-highlight text-sm dark:bg-bg-highlight-dark">
											<span aria-hidden="true">{badge.emoji}</span><span class="sr-only">{badge.title}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</td>
					<td class="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{row.games}</td>
					<td class="px-3 py-2.5 text-right tabular-nums">
						<span class="block font-semibold">{fixed(row.kda, 2)}</span>
						<span class="hidden text-xs opacity-60 sm:block">{fixed(row.kills, 1)} / {fixed(row.deaths, 1)} / {fixed(row.assists, 1)}</span>
					</td>
					<td class="px-3 py-2.5 text-right tabular-nums">
						<span class={['block font-semibold', row.wins / row.games >= 0.5 ? 'text-success' : 'text-error']}>{percent(row.wins / row.games)}</span>
						<span class="hidden text-xs opacity-60 sm:block">{row.wins}승 {row.games - row.wins}패</span>
					</td>
					<td class="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{percent(row.killParticipation)}</td>
					<td class="hidden px-3 py-2.5 text-right tabular-nums lg:table-cell">{fixed(row.csPerMin, 1)}</td>
					<td class="hidden px-3 py-2.5 text-right tabular-nums lg:table-cell">{integer(row.damagePerMin)}</td>
					<td class="hidden px-3 py-2.5 text-right tabular-nums lg:table-cell">{fixed(row.visionPerGame, 1)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<PageNav total={rows.length} pageSize={PAGE_SIZE} {current} onchange={(next) => (current = next)} label="리더보드 쪽 이동" />
