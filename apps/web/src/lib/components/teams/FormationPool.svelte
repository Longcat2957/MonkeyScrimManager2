<script lang="ts">
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import PositionChips from '#lib/components/scrims/PositionChips.svelte';
	import { bestMmr, formatMmr, type FormationPlayer } from '#lib/features/scrims/formation.ts';
	import type { DragState } from './drag.svelte.ts';

	type Props = {
		players: FormationPlayer[];
		selectedId: string | null;
		interactive: boolean;
		drag: DragState;
		onselect: (registrationId: string) => void;
	};

	let { players, selectedId, interactive, drag, onselect }: Props = $props();
</script>

<!-- 아직 자리가 없는 선발 참가자. 끌어서 자리에 놓거나 누른 뒤 자리를 누른다. 배치된 사람을 여기로 끌면 미배정이 된다. -->
<section
	aria-labelledby="formation-pool"
	class={['bg-bg-surface transition dark:bg-bg-surface-dark', drag.over === 'pool' && 'ring-2 ring-primary/40 ring-inset dark:ring-dark/40']}
	ondragover={(event) => drag.enter(event, 'pool')}
	ondragleave={() => drag.leave('pool')}
	ondrop={(event) => drag.drop(event, 'pool')}
>
	<header class="flex items-center justify-between px-3 py-2.5">
		<h3 id="formation-pool" class="text-sm font-semibold">미배정 <span class="font-normal opacity-60 tabular-nums">{players.length}명</span></h3>
		<span class="text-xs opacity-60">{interactive ? '탭 선택 / 드래그' : '편성 보기'}</span>
	</header>
	{#if players.length === 0}
		<p class="px-3 pb-5 text-center text-sm text-gray-500 dark:text-gray-400">모든 참가자가 배정됐어요</p>
	{:else}
		<ul class="grid max-h-48 gap-1.5 overflow-y-auto px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
			{#each players as player (player.registrationId)}
				{#snippet content()}
					<PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
					<span class="flex min-w-0 flex-1 flex-col gap-1 text-left">
						<span class="truncate text-sm font-semibold">{player.displayName}</span>
						<span class="flex items-center gap-2">
							<PositionChips positions={player.positions} />
							<span class="text-xs text-gray-500 tabular-nums dark:text-gray-400">{formatMmr(bestMmr(player))}</span>
						</span>
					</span>
				{/snippet}
				<li>
					{#if interactive}
						<button
							type="button"
							draggable="true"
							aria-pressed={selectedId === player.registrationId}
							class={[
								'flex min-h-12 w-full cursor-grab items-center gap-2 rounded-(--radius-small) border px-2 py-1.5 active:cursor-grabbing',
								drag.id === player.registrationId && 'opacity-50',
								selectedId === player.registrationId
									? 'border-primary bg-primary/10 ring-2 ring-primary/30 dark:border-dark dark:bg-dark/15'
									: 'border-warning/20 bg-warning/5 hover:border-warning/40 hover:bg-warning/10'
							]}
							ondragstart={(event) => drag.start(event, player.registrationId)}
							ondragend={() => drag.end()}
							onclick={() => onselect(player.registrationId)}
						>
							{@render content()}
						</button>
					{:else}
						<span class="flex min-h-12 items-center gap-2 rounded-(--radius-small) border border-warning/20 bg-warning/5 px-2 py-1.5">{@render content()}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
