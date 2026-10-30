import { MediaQuery } from 'svelte/reactivity';

// 데스크톱 기준은 Tailwind lg(1024px) 하나로 통일한다.
const query = new MediaQuery('min-width: 1024px', false);

// SSR은 모바일 기준으로 그린다. hydration 중에 실제 값을 쓰면 서버 HTML과 구조가 달라지므로
// 루트 레이아웃이 마운트된 뒤에만 실제 화면 폭을 반영한다.
let hydrated = $state(false);

export function markHydrated() {
	hydrated = true;
}

export const desktop = {
	get current() {
		return hydrated && query.current;
	}
};
