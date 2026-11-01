<script lang="ts">
	// 0~1 값의 축 여러 개를 한 다각형으로 그린다. 한 사람의 값만 그리므로 범례 없이 축 이름만 쓴다.
	let { title, axes }: { title: string; axes: { label: string; value: number; detail: string }[] } = $props();

	const SIZE = 300;
	const CENTER = SIZE / 2;
	const RADIUS = 96;
	const RINGS = [0.25, 0.5, 0.75, 1];

	const point = (index: number, scale: number) => {
		const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
		return [CENTER + Math.cos(angle) * RADIUS * scale, CENTER + Math.sin(angle) * RADIUS * scale] as const;
	};
	const polygon = (scale: (index: number) => number) => axes.map((_, index) => point(index, scale(index)).join(',')).join(' ');
	const clamp = (value: number) => Math.min(1, Math.max(0.04, value));
</script>

<figure class="flex flex-col items-center">
	<svg viewBox={`0 0 ${SIZE} ${SIZE}`} class="w-full max-w-80 overflow-visible text-info dark:text-dark" role="img" aria-label={title}>
		<g class="text-text-primary/15 dark:text-text-dark/20" fill="none" stroke="currentColor">
			{#each RINGS as ring (ring)}<polygon points={polygon(() => ring)} />{/each}
			{#each axes as axis, index (axis.label)}
				{@const [x, y] = point(index, 1)}
				<line x1={CENTER} y1={CENTER} x2={x} y2={y} />
			{/each}
		</g>
		<polygon points={polygon((index) => clamp(axes[index]!.value))} fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
		{#each axes as axis, index (axis.label)}
			{@const [x, y] = point(index, clamp(axis.value))}
			{@const [lx, ly] = point(index, 1.22)}
			<!-- 꼭짓점보다 넓은 투명 원을 겹쳐 마우스를 올리기 쉽게 한다. -->
			<g>
				<title>{axis.label} {axis.detail}</title>
				<circle cx={x} cy={y} r="12" fill="transparent" />
				<circle cx={x} cy={y} r="4" fill="currentColor" class="stroke-bg-surface dark:stroke-bg-surface-dark" stroke-width="2" />
			</g>
			<text x={lx} y={ly} text-anchor="middle" dominant-baseline="middle" class="fill-text-primary text-[13px] font-semibold dark:fill-text-dark">{axis.label}</text>
		{/each}
	</svg>
	<figcaption class="sr-only">
		<ul>
			{#each axes as axis (axis.label)}<li>{axis.label} {axis.detail}</li>{/each}
		</ul>
	</figcaption>
</figure>
