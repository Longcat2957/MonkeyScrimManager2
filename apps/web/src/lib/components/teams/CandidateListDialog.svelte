<script lang="ts">
	import { Button, Popup } from 'stdf';
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import PositionChips from '#lib/components/scrims/PositionChips.svelte';
	import { bestMmr, formatMmr, TEAM_SIZE, type AuctionView, type FormationPlayer } from '#lib/features/scrims/formation.ts';
	import { overlay } from '#lib/ui/overlay.ts';
	import { desktop } from '#lib/ui/viewport.svelte.ts';

	type Props = {
		open: boolean;
		auction: AuctionView;
		controls: boolean;
		busy: boolean;
		onassign: (registrationId: string, teamId: string) => void;
		onrestore: (registrationId: string) => void;
	};

	let { open = $bindable(false), auction, controls, busy, onassign, onrestore }: Props = $props();
</script>

{#snippet row(player: FormationPlayer)}
	<span class="flex min-w-0 items-center gap-2">
		<PlayerFace name={player.displayName} imageUrl={player.iconUrl} size="sm" />
		<span class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-sm font-semibold">{player.displayName}</span>
			<span class="flex items-center gap-2"><PositionChips positions={player.positions} /><span class="text-xs opacity-60 tabular-nums">MMR {formatMmr(bestMmr(player))}</span></span>
		</span>
	</span>
{/snippet}

{#snippet group(title: string, count: number, tone: string)}
	<div class="flex items-center justify-between">
		<h3 class={['text-xs font-semibold', tone]}>{title}</h3>
		<span class="text-xs opacity-60 tabular-nums">{count}명</span>
	</div>
{/snippet}

<div {@attach overlay({ open, label: '후보 목록', onclose: () => (open = false) })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} transparent>
		<div class="mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-(--radius-box) bg-bg-surface lg:rounded-(--radius-box) dark:bg-bg-surface-dark">
			<header class="flex items-center justify-between border-b border-border px-5 py-3">
				<h2 class="text-base font-semibold">후보 목록</h2>
				<Button fill="text" size="auto" heightOut="0" heightIn="2" injClass="px-2" onclick={() => (open = false)}>
					<span aria-hidden="true" class="text-lg leading-none">×</span><span class="sr-only">닫기</span>
				</Button>
			</header>
			<div class="flex flex-col gap-5 overflow-y-auto p-5">
				<section class="flex flex-col gap-2">
					{@render group('현재 후보', auction.openLot ? 1 : 0, 'text-primary dark:text-dark')}
					{#if auction.openLot}
						<div class="rounded-(--radius-small) border border-primary/30 bg-primary/5 p-2 dark:border-dark/30">{@render row(auction.openLot)}</div>
					{:else}
						<p class="rounded-(--radius-small) bg-bg-highlight/50 px-3 py-2 text-sm opacity-60 dark:bg-bg-highlight-dark/50">현재 후보 없음</p>
					{/if}
				</section>

				<section class="flex flex-col gap-2">
					{@render group('대기', auction.queue.length, '')}
					<!-- 다음 후보는 이 순서대로 뽑힌다. -->
					<ol class="flex flex-col gap-1.5">
						{#each auction.queue as player, index (player.registrationId)}
							<li class="flex items-center gap-2 rounded-(--radius-small) bg-bg-highlight/50 p-2 dark:bg-bg-highlight-dark/50">
								<span class="w-5 text-right text-xs opacity-50 tabular-nums">{index + 1}</span>
								{@render row(player)}
							</li>
						{:else}
							<li class="rounded-(--radius-small) bg-bg-highlight/50 px-3 py-2 text-sm opacity-60 dark:bg-bg-highlight-dark/50">대기 후보 없음</li>
						{/each}
					</ol>
				</section>

				<section class="flex flex-col gap-2">
					{@render group('유찰 후보', auction.unsold.length, 'text-warning')}
					<ul class="flex flex-col gap-1.5">
						{#each auction.unsold as player (player.registrationId)}
							<li class="flex flex-col gap-2 rounded-(--radius-small) border border-warning/20 bg-warning/5 p-2">
								{@render row(player)}
								{#if controls}
									<span class="flex flex-wrap justify-end gap-1">
										{#each auction.teams as team (team.id)}
											<Button fill="lineLight" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-xs" disabled={busy || Boolean(auction.openLot) || team.members.length >= TEAM_SIZE} onclick={() => onassign(player.registrationId, team.id)}>
												{team.name} 배치<span class="sr-only">, {player.displayName}</span>
											</Button>
										{/each}
										<Button fill="text" size="auto" heightOut="0" heightIn="1" injClass="px-2 text-xs" disabled={busy || Boolean(auction.openLot)} onclick={() => onrestore(player.registrationId)}>
											다시 올리기<span class="sr-only">, {player.displayName}</span>
										</Button>
									</span>
								{/if}
							</li>
						{:else}
							<li class="rounded-(--radius-small) bg-bg-highlight/50 px-3 py-2 text-sm opacity-60 dark:bg-bg-highlight-dark/50">유찰 후보 없음</li>
						{/each}
					</ul>
				</section>
			</div>
		</div>
	</Popup>
</div>
