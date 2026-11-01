<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DuoRecord } from '#lib/features/players/types.ts';

	// 같은 팀으로 함께한 사람과의 승률. 베스트·워스트가 같은 모양을 쓴다.
	let { title, records, guildId, tone }: { title: string; records: DuoRecord[]; guildId: string; tone: 'success' | 'error' } = $props();
</script>

<section class="flex flex-col gap-3">
	<h2 class="text-lg font-semibold">{title}</h2>
	{#if records.length}
		<ul class="flex flex-col gap-2">
			{#each records as record (record.userId)}
				<li>
					<a
						href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: record.userId })}
						class="flex items-center justify-between gap-3 rounded-(--radius-box) border border-border bg-bg-surface px-4 py-3 hover:bg-bg-highlight/50 dark:bg-bg-surface-dark dark:hover:bg-bg-highlight-dark/50"
					>
						<span class="flex min-w-0 flex-col">
							<span class="truncate font-semibold">{record.displayName}</span>
							<span class="text-xs opacity-60">{record.games}게임 함께</span>
						</span>
						<span class={['text-lg font-bold tabular-nums', tone === 'success' ? 'text-success' : 'text-error']}>{Math.round((record.wins / record.games) * 100)}%</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="rounded-(--radius-box) border border-dashed border-border px-4 py-3 text-sm opacity-60">세 게임 이상 함께한 사람이 없어요</p>
	{/if}
</section>
