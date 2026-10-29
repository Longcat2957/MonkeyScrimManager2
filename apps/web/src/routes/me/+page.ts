import { dev } from '$app/env';
import { getMeMockData } from '#lib/mocks/me.ts';
import type { MeScenario } from '#lib/features/me/types.ts';
import type { PageLoad } from './$types';

const scenarios: MeScenario[] = [
	'ready', 'empty', 'load-error', 'save-error', 'lookup-error', 'link-error', 'unlink-error', 'signed-out'
];

export const load: PageLoad = ({ url }) => {
	const requested = url.searchParams.get('preview');
	const scenario = dev && scenarios.includes(requested as MeScenario)
		? requested as MeScenario
		: dev ? 'ready' : 'signed-out';

	// 실제 인증이 연결되기 전에는 개발 모드에서만 예시 개인정보를 제공한다.
	return { scenario, me: scenario === 'signed-out' ? null : getMeMockData(scenario) };
};
