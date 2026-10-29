<script lang="ts">
	import type { StatusMeta } from './status.ts';

	let { status }: { status: StatusMeta } = $props();
</script>

<!--
	상태 라벨. STDF Tag는 role="button"으로 렌더되어 표시용 라벨에 쓸 수 없으므로 native span이다.
	마커는 채움(liveㆍdone)과 빈 원(waitㆍdanger)으로 "지금/기다림"을 함께 전한다.
-->
<span class="state state--{status.tone}">
	<i aria-hidden="true"></i>{status.text}
</span>
