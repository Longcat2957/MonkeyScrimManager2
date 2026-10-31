<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import SectionState from '#lib/components/common/SectionState.svelte';
	import ManualFormationBoard from '#lib/components/teams/ManualFormationBoard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim.title} · 수동 편성 | {SERVICE_NAME}</title>
</svelte:head>

{#if data.formation}
	<ManualFormationBoard
		teams={data.formation.teams}
		players={data.formation.players}
		assignments={data.formation.assignments}
		confirmed={data.formation.confirmed}
		editable={data.can?.edit ?? false}
		pairs={data.formation.pairs}
	/>
{:else}
	<section aria-labelledby="manual-formation" class="flex flex-col gap-4">
		<h2 id="manual-formation" class="text-xl font-semibold">수동 편성</h2>
		<SectionState state="empty" message="모집이 마감되면 선발된 참가자로 팀을 편성할 수 있어요" />
	</section>
{/if}
