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

	const active = $derived(activeDestination(items, current));
</script>

<!-- 서버·내전 문맥의 이동 목적지. 데스크톱과 모바일이 같은 DOM을 쓴다. -->
<nav aria-label={`${label} 메뉴`}>
	<ul
		class="shell flex h-[var(--app-rail-height)] items-stretch gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	>
		{#each items as item (item.href)}
			<li class="shrink-0">
				<a
					href={item.href}
					aria-current={active === item.href ? 'page' : undefined}
					class="flex h-full items-center border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors {active ===
					item.href
						? 'border-accent text-fg'
						: 'border-transparent text-faint hover:text-fg'}"
				>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
