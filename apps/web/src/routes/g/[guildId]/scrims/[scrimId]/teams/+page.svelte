<script lang="ts">
	import { SERVICE_NAME } from '#lib/branding.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.scrim?.title ?? '팀 편성'} · 팀 편성 | {SERVICE_NAME}</title>
</svelte:head>

<!-- 편성 방식이 정해진 내전은 load에서 방식별 페이지로 이동하므로 여기에는 미정 상태만 남는다. -->
<h2 class="text-xl font-semibold">팀 편성</h2>
<p class="mt-4">편성 방식이 정해지지 않았어요.</p>
{#if data.scrim?.canManage}
	<p class="mt-1 text-sm opacity-70">요약의 내전 설정에서 편성 방식을 정할 수 있어요.</p>
{/if}
