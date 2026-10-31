<script lang="ts">
	import { Switch } from 'stdf';

	type Props = {
		title: string;
		subTitle?: string;
		active: boolean;
		disabled?: boolean;
		// 마지막 행이 아니면 STDF Cell처럼 안쪽으로 들인 구분선을 그린다.
		line?: boolean;
		// 폼 안에서 값만 바인딩할 때는 생략한다.
		onchange?: (active: boolean) => void;
	};

	let { title, subTitle = '', active = $bindable(), disabled = false, line = false, onchange }: Props = $props();
</script>

<!--
	STDF Cell의 스위치 행은 button 안에 Switch button이 들어가 HTML이 깨진다.
	행은 label로 만들어 STDF Switch 하나만 조작 요소로 두고, 제목·현재 값을 그 이름으로 쓴다.
	모양은 CellGroup 안의 Cell과 같은 클래스를 쓴다.
-->
<label class="block cursor-pointer bg-bg-surface px-3 dark:bg-bg-surface-dark">
	<span
		class={[
			'flex w-full items-center justify-between gap-4 py-4',
			line && 'border-b border-text-primary/5 dark:border-text-dark/5'
		]}
	>
		<span class="flex min-w-0 flex-col">
			<span class="font-medium">{title}<span class="sr-only">, {active ? '켜짐' : '꺼짐'}</span></span>
			{#if subTitle}
				<span class="text-xs text-gray-500 dark:text-gray-400">{subTitle}</span>
			{/if}
		</span>
		<span class="shrink-0">
			<Switch bind:active inside="state" radius="full" {disabled} {onchange} />
		</span>
	</span>
</label>
