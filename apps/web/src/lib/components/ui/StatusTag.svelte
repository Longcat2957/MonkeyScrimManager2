<script lang="ts">
	import type { StatusMeta, Tone } from './status.ts';

	let { status }: { status: StatusMeta } = $props();

	// 톤 → 의미 토큰. 색은 보조 신호이며 문구가 항상 함께 읽힌다.
	const toneVar: Record<Tone, string> = {
		theme: '--info',
		info: '--info',
		success: '--success',
		warning: '--warning',
		error: '--danger',
		neutral: '--text-muted'
	};

	const color = $derived(`var(${toneVar[status.tone]})`);
</script>

<!-- STDF Tag는 role="button"으로 렌더되어 표시용 라벨에는 쓸 수 없다. 상태 라벨은 native span이다. -->
<span
	class="inline-flex w-fit items-center gap-1.5 justify-self-start rounded-full border px-2 py-0.5 text-caption leading-5 whitespace-nowrap"
	style:color
	style:border-color={`color-mix(in oklab, ${color} 35%, transparent)`}
>
	<span class="size-1.5 rounded-full" style:background={color} aria-hidden="true"></span>
	{status.text}
</span>
