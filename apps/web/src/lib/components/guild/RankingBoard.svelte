<script lang="ts">
	import { CellGroup, InfiniteScroll, Tab } from 'stdf';
	import { resolve } from '$app/paths';
	import LinkCell from '#lib/components/common/LinkCell.svelte';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import type { GuildRanking, LolPosition, RankingEntry, RankingPage } from '#lib/features/guild/types.ts';
	import { POSITIONS } from '#lib/features/labels.ts';
	import type { SectionResult } from '#lib/features/section.ts';

	type Props = {
		guildId: string;
		ranking: SectionResult<GuildRanking | null>;
		onretry: () => Promise<void>;
	};

	let { guildId, ranking, onretry }: Props = $props();

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
	let loading = $state(false);
	let failed = $state(false);

	function selectPosition(index: number) {
		active = index;
		failed = false;
		scroller?.scrollTo({ top: 0 });
	}

	async function loadMore() {
		const key = position.key;
		const current = pages[key];
		if (!current?.hasMore) return;
		// STDF InfiniteScroll은 onload 뒤 잠기고, loading이 true에서 false로 돌아올 때 다시 풀린다.
		loading = true;
		try {
			const response = await fetch(
				`${resolve('/g/[guildId]/ranking', { guildId })}?position=${key}&offset=${current.entries.length}`
			);
			if (!response.ok) throw new Error(String(response.status));
			const next: RankingPage = await response.json();
			pages = { ...pages, [key]: { ...next, entries: [...current.entries, ...next.entries] } };
			failed = false;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	const MEDAL = ['bg-medal-gold', 'bg-medal-silver', 'bg-medal-bronze'];
	const winRate = (entry: RankingEntry) => (entry.games ? Math.round((entry.wins / entry.games) * 100) : 0);
</script>

{#snippet row(entry: RankingEntry, line: boolean)}
	<LinkCell
		href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: entry.userId })}
		{line}
		title={entry.displayName}
		subTitle={`${entry.games}전 ${entry.wins}승 · 승률 ${winRate(entry)}%`}
	>
		{#snippet leftChild()}
			<span class="flex items-center gap-3">
				<span
					class={[
						'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums',
						entry.rank <= 3 ? [MEDAL[entry.rank - 1], 'text-bg-base-dark'] : 'text-gray-500 dark:text-gray-400'
					]}
				>
					<span class="sr-only">순위 </span>{entry.rank}
				</span>
				{#if entry.iconUrl}
					<img src={entry.iconUrl} alt="" width="36" height="36" loading="lazy" class="size-9 rounded-full" />
				{:else}
					<span
						class="flex size-9 items-center justify-center rounded-full bg-bg-highlight text-sm font-semibold dark:bg-bg-highlight-dark"
						aria-hidden="true"
					>
						{entry.displayName.slice(0, 1)}
					</span>
				{/if}
			</span>
		{/snippet}
		{#snippet detailChild()}
			<span class="flex items-center gap-2">
				{#if entry.isMe}
					<span
						class="rounded-full bg-primary px-1.5 py-0.5 text-[0.6875rem] font-semibold text-text-on-primary dark:bg-dark dark:text-text-on-dark"
					>
						나
					</span>
				{/if}
				<span class="font-bold tabular-nums">{Math.round(entry.mmr).toLocaleString('ko-KR')}</span>
			</span>
		{/snippet}
	</LinkCell>
{/snippet}

<section aria-labelledby="ranking" class="flex flex-col gap-3">
	<div class="flex items-baseline justify-between gap-4">
		<h2 id="ranking" class="text-lg font-semibold">서버 순위</h2>
		{#if ranking.ok && ranking.value}
			<span class="text-xs text-gray-500 dark:text-gray-400">{ranking.value.seasonName} · 포지션별 MMR</span>
		{/if}
	</div>

	{#if !ranking.ok}
		<SectionState state="error" message="순위를 불러오지 못했어요" {onretry} />
	{:else if !ranking.value}
		<SectionState state="empty" message="이번 시즌 순위가 아직 없어요" />
	{:else}
		<CellGroup my="0" mx="0" shadow="none">
			<!-- STDF Tab은 탭 역할을 알리지 않으므로 묶음 이름을 붙이고, 선택한 포지션은 목록 이름으로 알린다. -->
			<div role="group" aria-label="포지션 선택" class="border-b border-text-primary/5 px-1 dark:border-text-dark/5">
				<Tab labels={POSITIONS.map(({ text }) => ({ text }))} {active} onclickTab={selectPosition} />
			</div>
			{#if board && board.entries.length}
				<!-- 카드 안에서 스크롤하며 다음 순위를 불러온다. 페이지 전체 길이는 늘어나지 않는다. -->
				<div bind:this={scroller} class="relative max-h-[26rem] overflow-y-auto overscroll-contain">
					<ul aria-label={`${position.text} 순위`}>
						{#each board.entries as entry, index (entry.userId)}
							<li>{@render row(entry, index < board.entries.length - 1)}</li>
						{/each}
					</ul>
					{#if scroller}
						{#key position.key}
							<InfiniteScroll
								scrollTarget={scroller}
								bind:loading
								bind:error={failed}
								finished={!board.hasMore}
								offset={120}
								loadingText="불러오는 중"
								finishedText="마지막 순위예요"
								errorText="불러오지 못했어요. 눌러서 다시 시도해 주세요"
								textClass="text-xs text-gray-500 dark:text-gray-400"
								onload={loadMore}
							/>
						{/key}
					{/if}
				</div>
				{#if pinnedMe}
					<div class="border-t border-text-primary/10 dark:border-text-dark/10">
						{@render row(pinnedMe, false)}
					</div>
				{/if}
			{:else}
				<p class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{position.text} 기록이 아직 없어요</p>
			{/if}
		</CellGroup>
	{/if}
</section>
