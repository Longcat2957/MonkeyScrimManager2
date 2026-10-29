<script lang="ts" generics="T extends string">
	/*
	 * 배타 선택(상태 필터·편성 방식·BO). STDF Radio는 role/checked 연결이 없어 native radio를 쓴다.
	 */
	let {
		legend,
		name,
		options,
		value = $bindable(),
		onchange,
		variant = 'chip'
	}: {
		legend: string;
		name: string;
		options: readonly { value: T; label: string }[];
		value: T;
		onchange?: (value: T) => void;
		variant?: 'chip' | 'card';
	} = $props();
</script>

<fieldset class="min-w-0">
	<legend class="text-body-s font-semibold">{legend}</legend>
	<div class="mt-2 flex flex-wrap gap-2">
		{#each options as option (option.value)}
			<label
				class="inline-flex min-h-11 cursor-pointer items-center border text-body-s transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)] {value ===
				option.value
					? 'border-action bg-surface-raised font-semibold text-fg'
					: 'border-line text-muted hover:border-line-strong'} {variant === 'card'
					? 'rounded-sm px-4 py-2'
					: 'rounded-full px-3'}"
			>
				<!-- 라디오는 키보드·스크린리더용으로만 남기고, 칩 자체가 조작 모양이 된다. -->
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
