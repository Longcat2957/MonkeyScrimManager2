<script lang="ts" module>
	export type StackPerson = { key: string; name: string; imageUrl: string | null };
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { AvatarGroup } from 'stdf';
	import { initialAvatarUrl } from '#lib/ui/avatar.ts';

	type Props = {
		people: StackPerson[];
		// 전체 인원이다. people보다 많으면 남은 수를 +N으로 표시한다.
		total: number;
		max?: number;
		size?: 'xs' | 'sm';
	};

	let { people, total, max = 5, size = 'xs' }: Props = $props();

	const PX = { xs: 24, sm: 40 };
	// STDF AvatarGroup은 compact 4일 때 항목을 40%씩 겹친다.
	const OVERLAP = 0.4;

	const shown = $derived(people.slice(0, max));
	const remaining = $derived(Math.max(0, total - shown.length));
	// 인원수는 보통 옆 문구에 이미 있으므로 보조기기에는 누가 있는지만 읽힌다. 예: 홍길동, 김철수 외 3명
	const label = $derived(shown.map((person) => person.name).join(', ') + (remaining ? ` 외 ${remaining}명` : ''));
	// STDF는 image를 each 키로 쓰므로 같은 챔피언 아이콘도 사람마다 다른 URL이 되게 fragment를 붙인다.
	const data = $derived(
		shown.map((person) => ({ image: person.imageUrl ? `${person.imageUrl}#${person.key}` : initialAvatarUrl(person.name, person.key) }))
	);
	// AvatarGroup 루트가 w-full이라 감싸는 요소에 실제 너비를 준다.
	const width = $derived.by(() => {
		const count = shown.length + (remaining ? 1 : 0);
		return count ? Math.ceil(PX[size] * (1 + (count - 1) * (1 - OVERLAP))) + 6 : 0;
	});

	// STDF AvatarGroup은 button 안에 Avatar button을 넣어 SSR HTML이 깨지므로 마운트 후에만 그린다.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

<!--
	장식 요소로 다룬다. 조작 대상과 보조기기 트리에서 빼고(inert) 요약 문구만 읽게 한다.
	마운트 전에는 같은 크기의 자리만 잡아 레이아웃이 흔들리지 않게 한다.
-->
{#if shown.length}
	<span class="inline-flex shrink-0">
		<span class="sr-only">{label}</span>
		<span inert aria-hidden="true" class={['block', size === 'xs' ? 'h-6' : 'h-10']} style:width="{width}px">
			{#if mounted}
				<AvatarGroup {data} {size} radius="full" lineWidth="2" max={shown.length} top={remaining ? more : null} />
			{/if}
		</span>
	</span>
{/if}

{#snippet more()}
	<span
		class={[
			'flex items-center justify-center rounded-full bg-bg-highlight font-semibold tabular-nums dark:bg-bg-highlight-dark',
			size === 'xs' ? 'size-6 text-[0.625rem]' : 'size-10 text-xs'
		]}
	>
		+{remaining}
	</span>
{/snippet}
