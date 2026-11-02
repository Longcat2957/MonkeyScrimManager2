import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { readFormationMethod } from '#lib/features/scrims/settings.ts';
import { chooseMockFormationMethod } from '#lib/mocks/workflow.ts';
import type { Actions, PageServerLoad } from './$types';

// 편성 방식이 정해졌으면 방식별 페이지로 보낸다. 미정이면 이 페이지에서 방식을 고른다.
export const load: PageServerLoad = async ({ parent, params }) => {
	const { scrim } = await parent();
	if (scrim?.formationMethod === 'manual') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams/manual', params));
	}
	if (scrim?.formationMethod === 'auction') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams/auction', params));
	}
	return { can: { choose: Boolean(scrim?.canManage && scrim.status === 'preparing') } };
};

export const actions: Actions = {
	// 고른 뒤 페이지 데이터를 다시 불러오면 load가 방식별 페이지로 보낸다.
	choose: async ({ request, params }) => {
		// TODO: DB 갱신과 운영 권한 확인으로 바꾼다.
		if (!dev) error(404, '내전을 찾을 수 없습니다.');
		const failure = await chooseMockFormationMethod(params.guildId, params.scrimId, readFormationMethod((await request.formData()).get('method')));
		return failure ? fail(failure.status, { message: failure.message }) : undefined;
	}
};
