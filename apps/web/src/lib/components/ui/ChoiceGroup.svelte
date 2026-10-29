<script lang="ts" generics="T extends string">
	/*
	 * 배타 선택(상태 필터·편성 방식·팀 수). STDF Radio는 role/checked 연결이 없어 native radio를 쓴다.
	 * 라디오는 키보드·스크린리더용으로만 남기고, 보이는 칩이 조작 모양이 된다.
	 */
	let {
		legend,
		name,
		options,
		value = $bindable(),
		onchange,
		visuallyHiddenLegend = false
	}: {
		legend: string;
		name: string;
		options: readonly { value: T; label: string }[];
		value: T;
		onchange?: (value: T) => void;
		/** 필터처럼 구역 라벨이 이미 뜻을 전달하는 경우 */
		visuallyHiddenLegend?: boolean;
	} = $props();
</script>

<fieldset class="min-w-0">
	<legend class={visuallyHiddenLegend ? 'sr-only' : 'lbl'}>{legend}</legend>
	<div class="mt-2 flex flex-wrap gap-2">
		{#each options as option (option.value)}
			<label class="chip">
				<input
					type="radio"
					{name}
					value={option.value}
					checked={value === option.value}
					class="sr-only"
					onchange={() => {
						value = option.value;
						onchange?.(option.value);
					}}
				/>
				{option.label}
			</label>
		{/each}
	</div>
</fieldset>
