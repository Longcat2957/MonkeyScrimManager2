<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import AuctionDraftBoard from '#lib/components/teams/AuctionDraftBoard.svelte';
	import AuctionSetupBoard from '#lib/components/teams/AuctionSetupBoard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim.title} · 경매 | {SERVICE_NAME}</title>
</svelte:head>

{#if !data.auction}
	<section aria-labelledby="auction-board" class="flex flex-col gap-4">
		<h2 id="auction-board" class="text-xl font-semibold">경매</h2>
		<SectionState state="empty" message="모집이 마감되면 선발된 참가자로 경매를 준비할 수 있어요" />
	</section>
{:else if data.auction.status === 'setup'}
	<AuctionSetupBoard teams={data.auction.teams} players={data.auction.players} editable={data.can.manage} />
{:else}
	<AuctionDraftBoard auction={data.auction} manager={data.can.manage} />
{/if}
