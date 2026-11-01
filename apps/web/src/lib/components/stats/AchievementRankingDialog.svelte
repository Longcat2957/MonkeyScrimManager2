<script lang="ts">
	import { Button, Popup } from 'stdf';
	import { resolve } from '$app/paths';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import type { AchievementRanking } from '#lib/features/players/achievements.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	// 업적 하나를 골라 1위 아래 순위까지 보여 준다. 고른 업적은 캐러셀과 함께 움직인다.
	let { open = $bindable(false), items, guildId, current = $bindable(0) }: { open: boolean; items: AchievementRanking[]; guildId: string; current: number } = $props();

	const item = $derived(items[current]);
</script>

<div {@attach overlay({ open, label: '업적별 순위', onclose: () => (open = false) })}>
	<Popup bind:visible={open} position={desktop.current ? 'right' : 'bottom'} size={0} transparent>
		<div class="flex max-h-[85dvh] w-full flex-col bg-bg-surface lg:h-dvh lg:max-h-none lg:w-[30rem] dark:bg-bg-surface-dark">
			<header class="flex items-center gap-3 border-b border-border px-5 py-4">
				<h2 class="flex-1 text-base font-semibold">업적별 순위</h2>
				<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-2" onclick={() => (open = false)}>
					<span aria-hidden="true" class="text-lg leading-none">×</span><span class="sr-only">닫기</span>
				</Button>
			</header>
			<div class="flex flex-col gap-4 overflow-y-auto p-5">
				<ul aria-label="업적 선택" class="flex flex-wrap gap-1.5">
					{#each items as achievement, index (achievement.id)}
						<li>
							<button
								type="button"
								aria-pressed={index === current}
								onclick={() => (current = index)}
								class={[
									'rounded-full border px-3 py-1.5 text-sm',
									index === current ? 'border-warning bg-warning/15 font-semibold' : 'border-border hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
								]}
							>
								<span aria-hidden="true">{achievement.emoji}</span> {achievement.title}
							</button>
						</li>
					{/each}
				</ul>
				{#if item}
					<section aria-labelledby="ranking-title" class="flex flex-col gap-2">
						<h3 id="ranking-title" class="text-sm opacity-70">{item.description}</h3>
						<ol class="flex flex-col">
							{#each item.entries as entry, index (entry.userId)}
								<li class="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
									<span class={['w-6 text-right font-bold tabular-nums', index === 0 && 'text-warning']}>{index + 1}</span>
									<PlayerFace name={entry.displayName} imageUrl={entry.iconUrl} />
									<a href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: entry.userId })} class="min-w-0 flex-1 truncate font-semibold hover:underline">{entry.displayName}</a>
									<span class="flex flex-col items-end text-sm tabular-nums">
										<span class="font-bold">{entry.value}</span>
										<span class="text-xs opacity-60">{entry.games}게임</span>
									</span>
								</li>
							{/each}
						</ol>
					</section>
				{/if}
			</div>
		</div>
	</Popup>
</div>
