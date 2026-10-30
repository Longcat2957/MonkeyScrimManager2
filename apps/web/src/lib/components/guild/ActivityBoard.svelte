<script lang="ts">
	import { untrack } from 'svelte';
	import { CellGroup, Tab } from 'stdf';
	import { resolve } from '$app/paths';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import MatchListRow from '#lib/components/matches/MatchListRow.svelte';
	import ScrimListRow from '#lib/components/scrims/ScrimListRow.svelte';
	import type { MatchListItem } from '#lib/features/matches/types.ts';
	import type { ScrimListItem } from '#lib/features/scrims/types.ts';
	import type { SectionResult } from '#lib/features/section.ts';

	type Props = {
		guildId: string;
		activeScrims: SectionResult<ScrimListItem[]>;
		recentMatches: SectionResult<MatchListItem[]>;
		// 맨 위 카드가 내전 하나를 이미 보여 주고 있으면 빈 상태 문구를 "다른"으로 바꾼다.
		heroShown: boolean;
		onretry: () => Promise<void>;
	};

	let { guildId, activeScrims, recentMatches, heroShown, onretry }: Props = $props();

	// 처음 열 때 진행 중인 내전이 없으면 최근 경기부터 보여 준다. 이후 탭은 사용자가 고른 대로 둔다.
	let active = $state(untrack(() => (activeScrims.ok && activeScrims.value.length === 0 ? 1 : 0)));
	const labels = $derived([
		{ text: activeScrims.ok ? `진행 중 ${activeScrims.value.length}` : '진행 중' },
		{ text: '최근 경기' }
	]);
</script>

<!-- 진행 중인 내전과 최근 경기를 한 카드에서 탭으로 나눈다. 전체 목록은 헤더의 내전·경기 기록 메뉴가 담당한다. -->
<section aria-labelledby="activity" class="flex flex-col gap-3">
	<h2 id="activity" class="text-lg font-semibold">내전 현황</h2>
	<CellGroup my="0" mx="0" shadow="none">
		<!-- STDF Tab은 탭 역할을 알리지 않으므로 묶음 이름을 붙이고, 선택한 내용은 목록 이름으로 알린다. -->
		<div role="group" aria-label="보기 선택" class="border-b border-text-primary/5 px-1 dark:border-text-dark/5">
			<Tab {labels} {active} onclickTab={(index) => (active = index)} />
		</div>

		{#if active === 0}
			{#if !activeScrims.ok}
				<div class="p-3"><SectionState state="error" message="내전을 불러오지 못했어요" {onretry} /></div>
			{:else if activeScrims.value.length === 0}
				<p class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{heroShown ? '다른 진행 중인 내전이 없어요' : '진행 중인 내전이 없어요'}
				</p>
			{:else}
				<ul aria-label="진행 중인 내전">
					{#each activeScrims.value as scrim, index (scrim.id)}
						<li>
							<ScrimListRow
								{scrim}
								href={resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: scrim.id })}
								line={index < activeScrims.value.length - 1}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if !recentMatches.ok}
			<div class="p-3"><SectionState state="error" message="경기 기록을 불러오지 못했어요" {onretry} /></div>
		{:else if recentMatches.value.length === 0}
			<p class="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">아직 기록된 경기가 없어요</p>
		{:else}
			<ul aria-label="최근 경기">
				{#each recentMatches.value as match, index (match.id)}
					<li>
						<MatchListRow
							{match}
							href={resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: match.id })}
							line={index < recentMatches.value.length - 1}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</CellGroup>
</section>
