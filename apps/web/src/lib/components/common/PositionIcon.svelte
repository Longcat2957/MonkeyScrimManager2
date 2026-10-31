<script lang="ts">
	import { asset } from '$app/paths';
	import type { LolPosition } from '#lib/features/guild/types.ts';

	// 포지션 아이콘(Riot 라인 아이콘). 장식이므로 포지션 이름은 옆 텍스트나 접근 가능한 이름으로 따로 준다.
	let { position, size = 'md' }: { position: LolPosition; size?: 'sm' | 'md' | 'lg' } = $props();

	const FILE = {
		top: 'riot/positions/top.svg',
		jungle: 'riot/positions/jungle.svg',
		mid: 'riot/positions/mid.svg',
		bot: 'riot/positions/bottom.svg',
		support: 'riot/positions/support.svg'
	} as const satisfies Record<LolPosition, string>;
	const SIZE = { sm: 'size-4', md: 'size-6', lg: 'size-8' };
</script>

<img src={asset(FILE[position])} alt="" aria-hidden="true" class={['shrink-0 object-contain', SIZE[size]]} />
