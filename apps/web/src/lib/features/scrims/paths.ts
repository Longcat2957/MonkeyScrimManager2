import { resolve } from '$app/paths';
import type { FormationMethod, ScrimStatus } from './types.ts';

type Params = { guildId: string; scrimId: string };

/** 편성 방식별 작업판 경로. 방식이 정해지지 않았으면 null이다(요약에서 고른다). */
export function formationPath(params: Params, method: FormationMethod | null): string | null {
	if (method === 'manual') return resolve('/g/[guildId]/scrims/[scrimId]/manual', params);
	if (method === 'auction') return resolve('/g/[guildId]/scrims/[scrimId]/auction', params);
	return null;
}

/** 경기를 끝까지 치렀거나 중도 종료한 내전. 대진 대신 결과 화면을 쓴다. */
export const hasResult = (status: ScrimStatus) => status === 'completed' || status === 'ended_early';

/** 대진 화면 경로. 끝난 내전은 결과(/result), 나머지는 대진 운영(/bracket)이다. */
export function bracketPath(params: Params, status: ScrimStatus): string {
	return hasResult(status) ? resolve('/g/[guildId]/scrims/[scrimId]/result', params) : resolve('/g/[guildId]/scrims/[scrimId]/bracket', params);
}
