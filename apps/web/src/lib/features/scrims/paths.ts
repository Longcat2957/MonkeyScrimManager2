import { resolve } from '$app/paths';
import type { FormationMethod } from './types.ts';

type Params = { guildId: string; scrimId: string };

/** 편성 방식별 작업판 경로. 방식이 정해지지 않았으면 null이다(요약에서 고른다). */
export function formationPath(params: Params, method: FormationMethod | null): string | null {
	if (method === 'manual') return resolve('/g/[guildId]/scrims/[scrimId]/teams/manual', params);
	if (method === 'auction') return resolve('/g/[guildId]/scrims/[scrimId]/teams/auction', params);
	return null;
}
