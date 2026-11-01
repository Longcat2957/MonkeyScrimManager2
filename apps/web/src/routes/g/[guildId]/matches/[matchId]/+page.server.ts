import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { getMockMatch, recordMockGame, type RawGame } from '#lib/mocks/matches.ts';
import { dataDragonSplashUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { loadoutResolver } from '#lib/server/ddragon/loadout.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { RoflError } from '#lib/server/rofl/format.ts';
import { projectRoflGame } from '#lib/server/rofl/projection.ts';
import type { Actions, PageServerLoad } from './$types';

// 실제 경기 파일은 수십 MB 안쪽이다. 이보다 크면 읽기 전에 거절한다.
const MAX_ROFL_BYTES = 64 * 1024 * 1024;

// TODO: DB 조회와 서버 열람·업로드 권한 확인으로 바꾼다.
function requireDev() {
	if (!dev) error(404, '경기를 찾을 수 없습니다.');
}

export const load: PageServerLoad = async ({ params, url }) => {
	requireDev();
	const version = await latestDataDragonVersion();
	const [champion, loadout] = await Promise.all([championResolver(version), loadoutResolver(version)]);
	const result = await getMockMatch(params.guildId, params.matchId, url.searchParams.get('game'), {
		champion,
		...loadout,
		splash: (championId) => (version && championId ? dataDragonSplashUrl(championId) : null)
	});
	if (!result) error(404, '경기를 찾을 수 없습니다.');
	return result;
};

function toRawGame(bytes: Uint8Array): RawGame | string {
	try {
		const projection = projectRoflGame(bytes);
		if (projection.result.status !== 'consistent') return '결과를 확인할 수 없어 기록하지 않았어요';
		return {
			gameVersion: projection.gameVersion,
			gameLengthMs: projection.gameLengthMs,
			participants: projection.participants.map((player) => ({
				riotId: player.riotId,
				champion: player.champion,
				teamId: player.teamId,
				win: player.win,
				stats: player.stats,
				loadout: { ...player.loadout, keystoneId: player.loadout.runeIds[0] ?? null }
			}))
		};
	} catch (cause) {
		if (cause instanceof RoflError) return '읽을 수 없는 ROFL 파일이에요';
		throw cause;
	}
}

export const actions: Actions = {
	upload: async ({ request, params }) => {
		requireDev();
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.rofl')) return fail(400, { message: 'ROFL 파일을 골라 주세요' });
		if (file.size > MAX_ROFL_BYTES) return fail(413, { message: '파일이 너무 커요' });
		const raw = toRawGame(new Uint8Array(await file.arrayBuffer()));
		if (typeof raw === 'string') return fail(422, { message: raw });
		// TODO: 참가자 연결(ROFL 계정 ↔ 이 경기의 팀원) 검증을 실제 저장소와 함께 붙인다.
		const result = await recordMockGame(params.guildId, params.matchId, raw);
		if ('status' in result) return fail(result.status, { message: result.message });
		return { order: result.order };
	}
};
