<script lang="ts">
	import { activeDestination, type Destination } from '#lib/shell/navigation.ts';

	let {
		items,
		label,
		current
	}: {
		items: Destination[];
		label: string;
		current: string;
	} = $props();

	// 가장 구체적인 경로 하나만 활성으로 표시한다.
	const active = $derived(activeDestination(items, current));
</script>

<!--
	서버·내전 문맥의 이동 목적지.
	데스크톱과 모바일이 같은 DOM을 쓰고, 좁은 화면에서는 가로로 스크롤한다.
-->
<nav aria-label={`${label} 메뉴`} class="border-t border-line">
	<ul
		class="shell flex h-[var(--app-rail-height)] items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	>
		{#each items as item (item.href)}
			<li class="shrink-0">
				<a
					href={item.href}
					aria-current={active === item.href ? 'page' : undefined}
					class="flex h-full items-center border-b-2 px-3 text-body-s font-semibold whitespace-nowrap transition-colors {active ===
					item.href
						? 'border-action text-fg'
						: 'border-transparent text-muted hover:border-line-strong hover:text-fg'}"
				>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
