<script lang="ts">
	import type { LoadoutIcon } from '#lib/features/matches/types.ts';

	// 아이템·주문·룬 한 칸. 빈 칸은 같은 크기의 빈 상자로 자리를 유지한다. 이름은 alt·title로 준다.
	let { icon, size = 'md', round = false }: { icon: LoadoutIcon | null; size?: 'sm' | 'md'; round?: boolean } = $props();

	const SIZE = { sm: 'size-5', md: 'size-7' };
</script>

{#if icon?.iconUrl}
	<img src={icon.iconUrl} alt={icon.name} title={icon.name} loading="lazy" class={['shrink-0 bg-bg-highlight object-cover dark:bg-bg-highlight-dark', SIZE[size], round ? 'rounded-full' : 'rounded-(--radius-small)']} />
{:else if icon}
	<span title={icon.name} class={['flex shrink-0 items-center justify-center rounded-(--radius-small) bg-bg-highlight text-[0.5rem] dark:bg-bg-highlight-dark', SIZE[size]]}>{icon.name.slice(0, 2)}</span>
{:else}
	<span aria-hidden="true" class={['shrink-0 rounded-(--radius-small) bg-bg-highlight/60 dark:bg-bg-highlight-dark/60', SIZE[size]]}></span>
{/if}
