import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { ACHIEVEMENT_MIN_GAMES, achievementBadges, rankAchievements } from '#lib/features/players/achievements.ts';
import { championRecords, summarize } from '#lib/features/players/stats.ts';
import type { PlayerGame } from '#lib/features/players/types.ts';
import { listMockGuildPlayers } from '#lib/mocks/players.ts';
import { dataDragonSplashUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { PageServerLoad } from './$types';

const POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];
// 최근 기록만 볼 때 사용자마다 최근 몇 게임을 쓰는지.
const RECENT_GAMES = 10;
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
	const players = listMockGuildPlayers(champion);
	const allGames: PlayerGame[] = players.flatMap((player) => player.games);

	const requested = url.searchParams.get('position') as LolPosition;
	const position = POSITIONS.includes(requested) ? requested : 'all';
	const recent = url.searchParams.get('recent') === '1';
	const minGames = Math.min(50, Math.max(1, Math.floor(Number(url.searchParams.get('min'))) || DEFAULT_MIN_GAMES));

	const scoped = players.map(({ games, ...player }) => ({ ...player, games: position === 'all' ? games : games.filter((game) => game.position === position) }));
	const rows = scoped.flatMap(({ games, ...player }) => {
		const summary = summarize(games);
		return summary ? [{ ...player, ...summary }] : [];
	});
	// 업적은 포지션 필터와 최근 기록 여부를 함께 적용한다. 게임 기록은 최근 순이다.
	const achievements = rankAchievements(
		scoped.map(({ games, ...player }) => ({ ...player, summary: summarize(recent ? games.slice(0, RECENT_GAMES) : games) })),
		ACHIEVEMENT_MIN_GAMES
	);
	const badges = achievementBadges(achievements);
	const totalMinutes = allGames.reduce((sum, game) => sum + game.durationSec, 0) / 60;
	const totalKills = allGames.reduce((sum, game) => sum + game.kills, 0);
	const overall = summarize(allGames);
	const championOf = new Map(players.map((player) => [player.userId, player.championId]));
	const splash = (userId: string) => {
		const id = championOf.get(userId);
		return id ? dataDragonSplashUrl(id) : null;
	};

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
		achievements: achievements.map((item) => ({ ...item, splashUrl: splash(item.entries[0]!.userId) })),
		achievementMinGames: ACHIEVEMENT_MIN_GAMES,
		recent,
		position,
		minGames,
		leaderboard: rows.filter((row) => row.games >= minGames).map((row) => ({ ...row, badges: badges.get(row.userId) ?? [] })),
		playerCount: rows.length,
		champions: championRecords(position === 'all' ? allGames : allGames.filter((game) => game.position === position))
	};
};
