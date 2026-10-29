<script lang="ts">
	import { afterNavigate } from '$app/navigation';

	// 화면 이동 뒤에는 본문으로 포커스를 옮겨 스크린리더가 새 내용부터 읽게 한다.
	// 최초 진입은 건너뛰고, 이동할 때만 옮긴다.
	afterNavigate((navigation) => {
		if (navigation.type === 'enter') return;
		const main = document.getElementById('main-content');
		main?.focus({ preventScroll: false });
	});
</script>
