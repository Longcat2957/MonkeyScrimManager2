<script lang="ts">
	import { Button } from 'stdf';
	import { resolve } from '$app/paths';
	import type { GuildStory } from '#lib/features/guild/types.ts';

	let { guildId, stories }: { guildId: string; stories: GuildStory[] } = $props();

	const KIND: Record<GuildStory['kind'], { label: string; class: string }> = {
		win_streak: { label: '연승 행진', class: 'bg-warning' },
		loss_streak: { label: '연패 탈출 도전', class: 'bg-info' },
		most_kills: { label: '이번 주 최다 킬', class: 'bg-error' },
		comeback: { label: '역전승', class: 'bg-success' },
		first_win: { label: '첫 승', class: 'bg-text-dark' }
	};

	let track: HTMLUListElement | null = $state(null);
	let atStart = $state(true);
	let atEnd = $state(false);

	function updateEdges() {
		if (!track) return;
		atStart = track.scrollLeft <= 1;
		atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
	}

	function move(direction: 1 | -1) {
		const card = track?.querySelector('li');
		if (!track || !card) return;
		track.scrollBy({ left: direction * (card.getBoundingClientRect().width + 12) });
	}
</script>

<!--
	STDF Swiper는 슬라이드마다 데이터를 넘길 수 없고 키보드로 넘길 수단이 없어 가로 스크롤 스냅으로 만든다.
	각 카드는 링크라 Tab으로 이동하면 브라우저가 해당 카드를 보이게 스크롤한다. 이전·다음은 STDF Button.
-->
<section aria-labelledby="stories" class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-4">
		<h2 id="stories" class="text-lg font-semibold">이번 주 이야기</h2>
		{#if stories.length > 1}
			<div class="flex gap-1">
				<Button fill="lineLight" size="auto" heightOut="0" heightIn="1" injClass="px-2" disabled={atStart} onclick={() => move(-1)}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
					<span class="sr-only">이전 이야기</span>
				</Button>
				<Button fill="lineLight" size="auto" heightOut="0" heightIn="1" injClass="px-2" disabled={atEnd} onclick={() => move(1)}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
					<span class="sr-only">다음 이야기</span>
				</Button>
			</div>
		{/if}
	</div>

	<ul
		bind:this={track}
		onscroll={updateEdges}
		class="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
	>
		{#each stories as story (story.id)}
			<li class="w-[85%] shrink-0 snap-start sm:w-80">
				<a
					href={resolve('/g/[guildId]/players/[userId]', { guildId, userId: story.userId })}
					class="relative isolate flex h-40 flex-col justify-end gap-1 overflow-hidden rounded-(--radius-box) bg-bg-base-dark p-4 text-text-dark no-underline ring-1 ring-white/10 focus-visible:-outline-offset-2 focus-visible:outline-text-dark"
				>
					{#if story.artUrl}
						<img src={story.artUrl} alt="" loading="lazy" class="absolute inset-0 -z-10 size-full object-cover object-[60%_20%] opacity-70" />
						<span class="absolute inset-0 -z-10 bg-linear-to-t from-bg-base-dark from-25% via-bg-base-dark/70 to-bg-base-dark/10"></span>
					{/if}
					<!-- 아트 위에서도 읽히도록 반투명 검정 바탕에 흰 글자를 쓰고, 종류는 색 점과 문구로 함께 알린다. -->
					<span class="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
						<span class={['size-1.5 rounded-full', KIND[story.kind].class]}></span>
						{KIND[story.kind].label}
					</span>
					<span class="text-2xl font-bold tabular-nums">{story.headline}</span>
					<span class="text-sm font-semibold">{story.displayName}</span>
					<span class="truncate text-xs text-text-dark/70">{story.detail}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
