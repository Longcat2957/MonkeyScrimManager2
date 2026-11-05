import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { LolPosition } from '#lib/features/guild/types.ts';
import {
    ACHIEVEMENT_MIN_GAMES,
    achievementBadges,
    rankAchievements
} from '#lib/features/players/achievements.ts';
import { championRecords, summarize } from '#lib/features/players/stats.ts';
import type { PlayerGame } from '#lib/features/players/types.ts';
import { listMockGuildPlayers } from '#lib/mocks/players.ts';
import { dataDragonSplashUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getGuildRecords, type GuildPlayerRecords } from '#lib/server/records/queries.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

const POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];
// 최근 기록만 볼 때 사용자마다 최근 몇 게임을 쓰는지.
const RECENT_GAMES = 10;
const DEFAULT_MIN_GAMES = 5;

export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
    const { guild } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');
    const demo = dev && Boolean(findMockGuild(params.guildId));
    if (demo && params.guildId !== 'devGuild001') return { empty: true as const };
    const champion = await championResolver(await latestDataDragonVersion());
    let players: GuildPlayerRecords[];
    let allGames: PlayerGame[];
    let recordedGames: { id: string; durationSec: number | null; kills: number | null }[];
    if (demo) {
        players = listMockGuildPlayers(champion);
        allGames = players.flatMap((player) => player.games);
        recordedGames = [];
    } else {
        try {
            ({ players, allGames, recordedGames } = await getGuildRecords(
                getDb(),
                locals.actor,
                params.guildId,
                champion
            ));
        } catch (cause) {
            routeError(cause);
        }
        if (!recordedGames.length) return { empty: true as const };
    }

    const requested = url.searchParams.get('position') as LolPosition;
    const position = POSITIONS.includes(requested) ? requested : 'all';
    const recent = url.searchParams.get('recent') === '1';
    const minGames = Math.min(
        50,
        Math.max(1, Math.floor(Number(url.searchParams.get('min'))) || DEFAULT_MIN_GAMES)
    );

    const scoped = players.map(({ games, ...player }) => ({
        ...player,
        games: position === 'all' ? games : games.filter((game) => game.position === position)
    }));
    const rows = scoped.flatMap(({ games, ...player }) => {
        const summary = summarize(games);
        return summary ? [{ ...player, ...summary }] : [];
    });
    // 업적은 포지션 필터와 최근 기록 여부를 함께 적용한다. 게임 기록은 최근 순이다.
    const achievements = demo
        ? rankAchievements(
              scoped.map(({ games, ...player }) => ({
                  ...player,
                  summary: summarize(recent ? games.slice(0, RECENT_GAMES) : games)
              })),
              ACHIEVEMENT_MIN_GAMES
          )
        : [];
    const badges = achievementBadges(achievements);
    const durationGames = recordedGames.filter((game) => game.durationSec !== null);
    const killGames = recordedGames.filter(
        (game) => game.kills !== null && game.durationSec !== null && game.durationSec > 0
    );
    const totalMinutes = allGames.reduce((sum, game) => sum + (game.durationSec ?? 0), 0) / 60;
    const totalKills = allGames.reduce((sum, game) => sum + (game.kills ?? 0), 0);
    const overall = summarize(allGames);
    const championOf = new Map(players.map((player) => [player.userId, player.championId]));
    const splash = (userId: string) => {
        const id = championOf.get(userId);
        return id ? dataDragonSplashUrl(id) : null;
    };

    return {
        empty: false as const,
        showAchievements: demo,
        kpis: {
            // 실제 기록은 출전자 수와 무관하게 완료 Game 행으로 센다.
            games: demo ? Math.round(allGames.length / 10) : recordedGames.length,
            players: players.filter((player) => player.games.length).length,
            averageDurationSec: demo
                ? Math.round((totalMinutes * 60) / allGames.length)
                : durationGames.length
                  ? Math.round(
                        durationGames.reduce((sum, game) => sum + game.durationSec!, 0) / durationGames.length
                    )
                  : null,
            // 킬·시간이 모두 검증된 Game만 같은 분자와 분모에 포함한다.
            killsPerMinute: demo
                ? totalKills / (totalMinutes / 10)
                : killGames.length
                  ? killGames.reduce((sum, game) => sum + game.kills!, 0) /
                    (killGames.reduce((sum, game) => sum + game.durationSec!, 0) / 60)
                  : null,
            kda: overall?.kda ?? null,
            champions: overall?.champions ?? null
        },
        achievements: achievements.map((item) => ({ ...item, splashUrl: splash(item.entries[0]!.userId) })),
        achievementMinGames: ACHIEVEMENT_MIN_GAMES,
        recent,
        position,
        minGames,
        leaderboard: rows
            .filter((row) => row.games >= minGames)
            .map((row) => ({ ...row, badges: badges.get(row.userId) ?? [] })),
        playerCount: rows.length,
        champions: championRecords(
            position === 'all' ? allGames : allGames.filter((game) => game.position === position)
        )
    };
};
