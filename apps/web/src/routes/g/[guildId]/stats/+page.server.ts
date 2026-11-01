import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { championRecords, summarize } from '#lib/features/players/stats.ts';
import type { PlayerGame } from '#lib/features/players/types.ts';
import { listMockPlayerGames } from '#lib/mocks/players.ts';
import { mockPlayers } from '#lib/mocks/ranking.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { PageServerLoad } from './$types';

const POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];
// 업적은 표본이 너무 작은 사람을 빼고 고른다.
const ACHIEVEMENT_MIN_GAMES = 4;
const DEFAULT_MIN_GAMES = 5;

export const load: PageServerLoad = async ({ parent, params, url }) => {
	// TODO: DB 집계와 서버 열람 권한 확인으로 바꾼다. 기간·시즌 범위는 정책이 정해지면 추가한다.
	if (!dev) error(404, '서버를 찾을 수 없습니다.');
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	if (params.guildId !== 'devGuild001') {
		return { empty: true as const };
	}

	const champion = await championResolver(await latestDataDragonVersion());
	const players = mockPlayers.map((player) => {
		const main = Object.values(player.records).sort((a, b) => b.games - a.games)[0];
		return { userId: player.userId, displayName: player.displayName, iconUrl: main ? champion(main.championId).iconUrl : null, games: listMockPlayerGames(player, champion) };
	});
	const allGames: PlayerGame[] = players.flatMap((player) => player.games);

	const requested = url.searchParams.get('position') as LolPosition;
	const position = POSITIONS.includes(requested) ? requested : 'all';
	const minGames = Math.min(50, Math.max(1, Math.floor(Number(url.searchParams.get('min'))) || DEFAULT_MIN_GAMES));

	const rows = players.flatMap(({ games, ...player }) => {
		const filtered = position === 'all' ? games : games.filter((game) => game.position === position);
		const summary = summarize(filtered);
		return summary ? [{ ...player, ...summary, champions: new Set(filtered.map((game) => game.champion.id)).size }] : [];
	});
	const eligible = rows.filter((row) => row.games >= ACHIEVEMENT_MIN_GAMES);
	const best = <T extends (typeof rows)[number]>(list: T[], pick: (row: T) => number) => [...list].sort((a, b) => pick(b) - pick(a))[0] ?? null;
	const totalMinutes = allGames.reduce((sum, game) => sum + game.durationSec, 0) / 60;
	const totalKills = allGames.reduce((sum, game) => sum + game.kills, 0);
	const overall = summarize(allGames);

	const achievement = (id: string, title: string, description: string, row: (typeof rows)[number] | null, value: (row: (typeof rows)[number]) => string) =>
		row ? [{ id, title, description, userId: row.userId, displayName: row.displayName, iconUrl: row.iconUrl, value: value(row), games: row.games }] : [];

	return {
		empty: false as const,
		kpis: {
			// 게임 하나에 열 명이 기록되므로 사용자 게임 수를 10으로 나눠 게임 수를 센다.
			games: Math.round(allGames.length / 10),
			players: players.filter((player) => player.games.length).length,
			averageDurationSec: Math.round((totalMinutes * 60) / allGames.length),
			// 사용자 게임 시간도 열 번씩 더해졌으므로 게임 시간으로 되돌려 게임 1분당 킬을 구한다.
			killsPerMinute: totalKills / (totalMinutes / 10),
			kda: overall?.kda ?? 0,
			champions: new Set(allGames.map((game) => game.champion.id)).size
		},
		achievements: [
			...achievement('damage', '딜량 왕', '분당 챔피언 피해량이 가장 많은 사람', best(eligible, (row) => row.damagePerMin), (row) => `${Math.round(row.damagePerMin).toLocaleString('ko-KR')} /분`),
			...achievement('kda', 'KDA 장인', '죽지 않고 싸운 사람', best(eligible, (row) => row.kda), (row) => `KDA ${row.kda.toFixed(2)}`),
			...achievement('vision', '시야 장인', '게임당 시야 점수가 가장 높은 사람', best(eligible, (row) => row.visionPerGame), (row) => `시야 ${row.visionPerGame.toFixed(1)}`),
			...achievement('participation', '한타 중독', '킬 관여율이 가장 높은 사람', best(eligible, (row) => row.killParticipation), (row) => `킬 관여 ${Math.round(row.killParticipation * 100)}%`),
			...achievement('farm', 'CS 머신', '분당 CS가 가장 많은 사람', best(eligible, (row) => row.csPerMin), (row) => `${row.csPerMin.toFixed(1)} CS/분`),
			...achievement('pool', '챔피언 폭', '가장 많은 챔피언을 플레이한 사람', best(eligible, (row) => row.champions), (row) => `챔피언 ${row.champions}개`)
		],
		position,
		minGames,
		leaderboard: rows.filter((row) => row.games >= minGames),
		playerCount: rows.length,
		champions: championRecords(position === 'all' ? allGames : allGames.filter((game) => game.position === position))
	};
};
