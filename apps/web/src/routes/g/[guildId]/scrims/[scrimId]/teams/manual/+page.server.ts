import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';

// 실제 편성 방식과 다른 경로로 들어오면 공통 진입점으로 보내 올바른 경로를 다시 정한다.
export const load: PageServerLoad = async ({ parent, params }) => {
	const { scrim } = await parent();
	if (scrim && scrim.formationMethod !== 'manual') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams', params));
	}
};
