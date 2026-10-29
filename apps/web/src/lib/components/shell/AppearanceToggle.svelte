<script lang="ts">
	import { appearance } from '#lib/shell/appearance.svelte.ts';

	const isDark = $derived(appearance.mode === 'dark');
</script>

<!--
	화면 모드 전환.
	STDF Button은 aria-label을 전달하지 못해 아이콘 단독 버튼에 접근 가능한 이름을 줄 수 없으므로
	이 컨트롤만 native 버튼을 쓴다. 이름은 유지하고 눌림 상태(aria-pressed)만 바뀐다.
-->
<button
	type="button"
	class="btn btn--text size-10 min-h-10 px-0"
	aria-label="다크 모드"
	aria-pressed={isDark}
	title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
	onclick={() => appearance.toggle()}
>
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if isDark}
			<!-- 라이트로 전환할 수 있음을 나타내는 해 -->
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		{:else}
			<!-- 다크로 전환할 수 있음을 나타내는 달 -->
			<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
		{/if}
	</svg>
</button>
