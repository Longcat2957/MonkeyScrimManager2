<script lang="ts">
	import { avatarColor } from '#lib/ui/avatar.ts';

	// 프로필 사진이나 주 챔피언 아이콘. 없으면 이름 첫 글자를 이름별 색 원에 쓴다. 장식이므로 이름을 읽히지 않는다.
	let { name, imageUrl, size = 'md' }: { name: string; imageUrl: string | null; size?: 'sm' | 'md' | 'lg' } = $props();

	const SIZE = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-16 text-2xl' };
</script>

{#if imageUrl}
	<img src={imageUrl} alt="" loading="lazy" class={['shrink-0 rounded-full object-cover ring-2 ring-bg-base dark:ring-bg-base-dark', SIZE[size]]} />
{:else}
	<span
		aria-hidden="true"
		class={['flex shrink-0 items-center justify-center rounded-full font-semibold text-white', SIZE[size]]}
		style:background-color={avatarColor(name)}
	>
		{name.slice(0, 1)}
	</span>
{/if}
