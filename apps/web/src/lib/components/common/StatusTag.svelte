<script lang="ts">
	import { Tag } from 'stdf';
	import type { TagProps } from 'stdf';

	let { text, state }: { text: string; state: NonNullable<TagProps['state']> } = $props();
</script>

<!--
	STDF Tag는 동작이 없어도 항상 role="button" tabindex="0"이라 링크·버튼 안에서 조작 요소가 중첩된다.
	모양은 STDF Tag를 그대로 쓰고 inert로 조작 대상에서 빼며, 문구는 보조기기용 텍스트로 따로 제공한다.
-->
<span class="inline-flex">
	<span class="sr-only">{text}</span>
	<span inert aria-hidden="true" class="inline-flex">
		<Tag {text} {state} fill="light" size="sm" />
	</span>
</span>
