/*
 * 개발 화면의 상태 시뮬레이션.
 * 정상·빈 데이터·느린 응답·오류·부분 실패를 URL로 확인한다. 운영 모드에서는 무시한다.
 */

export type Scenario = 'normal' | 'empty' | 'slow' | 'error' | 'partial';

const SCENARIOS: Scenario[] = ['normal', 'empty', 'slow', 'error', 'partial'];

export function currentScenario(url: URL, isDev: boolean): Scenario {
	if (!isDev) return 'normal';
	const raw = url.searchParams.get('scenario');
	return SCENARIOS.find((scenario) => scenario === raw) ?? 'normal';
}

/** 느린 응답을 재현한다. 로딩 표현을 확인할 때만 시간을 쓴다. */
export async function pause(scenario: Scenario, ms = 900): Promise<void> {
	if (scenario !== 'slow') return;
	await new Promise((resolve) => setTimeout(resolve, ms));
}
