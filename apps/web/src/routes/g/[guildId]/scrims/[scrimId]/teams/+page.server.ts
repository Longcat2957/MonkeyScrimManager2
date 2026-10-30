import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';

// 편성 방식이 정해졌으면 방식별 페이지로 보낸다. 미정이면 이 페이지에서 안내한다.
export const load: PageServerLoad = async ({ parent, params }) => {
	const { scrim } = await parent();
	if (scrim?.formationMethod === 'manual') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams/manual', params));
	}
	if (scrim?.formationMethod === 'auction') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams/auction', params));
	}
};
