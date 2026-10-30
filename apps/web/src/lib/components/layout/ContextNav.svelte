<script lang="ts">
	import type { NavItem } from './navigation.ts';

	type Props = {
		items: NavItem[];
		label: string;
		vertical?: boolean;
		onnavigate?: () => void;
	};

	let { items, label, vertical = false, onnavigate }: Props = $props();
</script>

<!-- STDF에는 링크 컴포넌트가 없으므로 라우트 이동은 a 요소로 제공한다. -->
<nav aria-label={label}>
	<ul class={['flex', vertical ? 'flex-col' : 'items-center gap-1']}>
		{#each items as item (item.href)}
			<li>
				<a
					href={item.href}
					aria-current={item.current ? 'page' : undefined}
					onclick={onnavigate}
					class={[
						'flex min-h-11 items-center rounded-(--radius-form) px-3 text-sm font-semibold no-underline',
						'hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark',
						item.current ? 'bg-bg-highlight dark:bg-bg-highlight-dark' : 'opacity-70',
						vertical && 'w-full'
					]}
				>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
