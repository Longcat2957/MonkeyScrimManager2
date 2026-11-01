import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { championRecords, duoRecords, summarize } from '#lib/features/players/stats.ts';
import { findMockPlayer, listMockPlayerGames } from '#lib/mocks/players.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;
const POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

export const load: PageServerLoad = async ({ parent, params, url }) => {
	// TODO: DB 조회, 서버 열람 권한과 대상의 공개 설정 확인으로 바꾼다.
	if (!dev) error(404, '사용자를 찾을 수 없습니다.');
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	const player = findMockPlayer(params.guildId, params.userId);
	if (!player) error(404, '사용자를 찾을 수 없습니다.');

	const champion = await championResolver(await latestDataDragonVersion());
	const games = listMockPlayerGames(player, champion);
	// 실제로 플레이한 포지션만 고를 수 있다. 알 수 없는 값은 전체로 읽는다.
	const played = POSITIONS.filter((key) => games.some((game) => game.position === key));
	const requested = url.searchParams.get('position') as LolPosition;
	const position = played.includes(requested) ? requested : 'all';
	const filtered = position === 'all' ? games : games.filter((game) => game.position === position);
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);
	const main = Object.values(player.records).sort((a, b) => b.games - a.games)[0];

	return {
		player: {
			userId: player.userId,
			displayName: player.displayName,
			iconUrl: main ? champion(main.championId).iconUrl : null,
			// TODO: 공개 설정이 허용한 Riot ID만 넘긴다.
			riotIds: [`${player.displayName}#KR1`]
		},
		recent: games.slice(0, 10).map(({ matchId, gameId, win, champion }) => ({ matchId, gameId, win, champion })),
		positions: played.map((key) => ({ key, games: games.filter((game) => game.position === key).length })),
		position,
		summary: summarize(filtered),
		champions: championRecords(filtered),
		duos: duoRecords(games),
		mmr: POSITIONS.flatMap((key) => {
			const record = player.records[key];
			return record ? [{ position: key, rating: record.mmr, games: record.games }] : [];
		}),
		history: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		total: filtered.length,
		page,
		pageSize: PAGE_SIZE
	};
};
