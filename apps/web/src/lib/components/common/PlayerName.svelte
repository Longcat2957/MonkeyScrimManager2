<script lang="ts">
	import { resolve } from '$app/paths';
	import PlayerFace from './PlayerFace.svelte';

	type Props = {
		guildId: string;
		displayName: string;
		// 사용자 연결이 없거나 link가 false면 이름만 표시한다.
		userId: string | null;
		// 프로필 사진이나 주 챔피언 아이콘. 없으면 이름 첫 글자를 이름별 색 원에 쓴다.
		imageUrl: string | null;
		// 본인이 공개를 허용했을 때만 넘어온다.
		riotId?: string | null;
		link?: boolean;
	};

	let { guildId, displayName, userId, imageUrl, riotId = null, link = true }: Props = $props();

	const href = $derived(link && userId ? resolve('/g/[guildId]/players/[userId]', { guildId, userId }) : null);
</script>

<!-- 참가 당시 표시 이름과 전적 링크 하나. 사진은 장식이므로 이름을 반복하지 않는다. -->
<span class="flex min-w-0 items-center gap-3">
	<PlayerFace name={displayName} {imageUrl} />
	<span class="flex min-w-0 flex-col">
		{#if href}
			<a {href} class="truncate font-medium hover:underline">{displayName}</a>
		{:else}
			<span class="truncate font-medium">{displayName}</span>
		{/if}
		{#if riotId}
			<span class="truncate text-xs text-gray-500 dark:text-gray-400">{riotId}</span>
		{/if}
	</span>
</span>
