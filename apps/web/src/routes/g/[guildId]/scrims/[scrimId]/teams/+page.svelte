<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim?.title ?? '팀 편성'} · 팀 편성 | {SERVICE_NAME}</title>
</svelte:head>

<!-- 편성 방식은 모집을 마감할 때 정하므로, load에서 방식별 페이지로 가지 않은 내전은 아직 모집 중(또는 취소)이다. -->
<h2 class="text-xl font-semibold">팀 편성</h2>
<p class="mt-4">모집이 마감되면 팀을 편성할 수 있어요.</p>
{#if data.scrim?.canManage && data.scrim.status === 'recruit'}
	<p class="mt-1 text-sm opacity-70">선발 인원이 다 차면 요약에서 모집을 마감하며 수동 편성과 경매 중 하나를 골라요.</p>
{/if}
