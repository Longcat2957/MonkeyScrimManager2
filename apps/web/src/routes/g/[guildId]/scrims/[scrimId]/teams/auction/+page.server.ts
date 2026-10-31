import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { MockFailure } from '#lib/mocks/scrims.ts';
import {
	assignMockCurrent,
	assignMockUnsold,
	awardMockLot,
	drawMockLot,
	getMockAuction,
	passMockLot,
	resetMockAuction,
	restoreMockUnsold,
	revertMockLot,
	saveMockAuctionSetup,
	shuffleMockQueue,
	startMockAuction
} from '#lib/mocks/teams.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { Actions, PageServerLoad } from './$types';

// TODO: DB 조회와 운영 권한 확인으로 바꾼다.
function requireDev() {
	if (!dev) error(404, '내전을 찾을 수 없습니다.');
}

// 실제 편성 방식과 다른 경로로 들어오면 공통 진입점으로 보내 올바른 경로를 다시 정한다.
export const load: PageServerLoad = async ({ parent, params, depends }) => {
	const { scrim } = await parent();
	if (scrim && scrim.formationMethod !== 'auction') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams', params));
	}
	requireDev();
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	depends('app:auction');
	// 모집이 끝나기 전에는 경매에 올릴 선발 인원이 확정되지 않았다.
	if (scrim.status === 'recruit') return { scrim, auction: null, can: { manage: false } };

	const version = await latestDataDragonVersion();
	const auction = await getMockAuction(
		params.guildId,
		params.scrimId,
		(id) => championIconUrl(version, id),
		await championResolver(version)
	);
	if (!auction) error(404, '내전을 찾을 수 없습니다.');
	return { scrim, auction, can: { manage: scrim.canManage } };
};

function failWith(failure: MockFailure | null) {
	return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

export const actions: Actions = {
	setup: async ({ request, params }) => {
		requireDev();
		let teams: { captainId: string | null; startPoints: number }[];
		try {
			teams = JSON.parse(field(await request.formData(), 'teams'));
		} catch {
			return fail(400, { message: '설정을 다시 확인해 주세요' });
		}
		return failWith(await saveMockAuctionSetup(params.guildId, params.scrimId, teams));
	},
	start: async ({ params }) => {
		requireDev();
		return failWith(await startMockAuction(params.guildId, params.scrimId));
	},
	draw: async ({ params }) => {
		requireDev();
		return failWith(await drawMockLot(params.guildId, params.scrimId));
	},
	award: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		return failWith(await awardMockLot(params.guildId, params.scrimId, field(data, 'teamId'), Number(field(data, 'price'))));
	},
	pass: async ({ params }) => {
		requireDev();
		return failWith(await passMockLot(params.guildId, params.scrimId));
	},
	assign: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		return failWith(await assignMockUnsold(params.guildId, params.scrimId, field(data, 'registrationId'), field(data, 'teamId')));
	},
	assignCurrent: async ({ request, params }) => {
		requireDev();
		return failWith(await assignMockCurrent(params.guildId, params.scrimId, field(await request.formData(), 'teamId')));
	},
	shuffle: async ({ params }) => {
		requireDev();
		return failWith(await shuffleMockQueue(params.guildId, params.scrimId));
	},
	restore: async ({ request, params }) => {
		requireDev();
		return failWith(await restoreMockUnsold(params.guildId, params.scrimId, field(await request.formData(), 'registrationId')));
	},
	revert: async ({ params }) => {
		requireDev();
		return failWith(await revertMockLot(params.guildId, params.scrimId));
	},
	reset: async ({ params }) => {
		requireDev();
		return failWith(await resetMockAuction(params.guildId, params.scrimId));
	}
};
