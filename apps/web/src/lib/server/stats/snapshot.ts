import {
    ACHIEVEMENT_MIN_GAMES,
    achievementBadges,
    rankAchievements
} from '../../features/players/achievements.ts';
import { championRecords, summarize } from '../../features/players/stats.ts';
import type { ChampionRef, PlayerGame } from '../../features/players/types.ts';
import type { RecordSeasonSelection } from '../../features/seasons.ts';
import { statsRequestKey, type StatsFilters, type StatsSnapshot } from '../../features/stats/types.ts';
import { listMockGuildPlayers } from '../../mocks/players.ts';
import type { Actor } from '../auth/types.ts';
import type { Database } from '../db/types.ts';
import { dataDragonSplashUrl } from '../ddragon/assets.ts';
import { championResolver } from '../ddragon/champions.ts';
import { dataDragon } from '../ddragon/client.ts';
import { requireGuildView } from '../guild/access.ts';
import { getGuildRecords, type GuildPlayerRecords } from '../records/queries.ts';
import { mockRecordSeasons } from '../records/seasons.ts';

const RECENT_GAMES = 10;

async function defaultChampionResolver() {
    let version: string | null = null;
    try {
        version = (await dataDragon.getVersions())[0] ?? null;
    } catch {
        // 이미지 메타데이터가 없어도 통계 수치는 기존처럼 조회한다.
    }
    return championResolver(version);
}

/** SSR과 통계 화면의 자동 갱신이 같은 공개 권한·시즌·수치 조립을 사용한다. */
export async function getGuildStatsSnapshot(
    db: Database | null,
    actor: Actor | null,
    guildId: string,
    filters: StatsFilters,
    options: { preview?: boolean; champion?: (id: string) => ChampionRef } = {}
): Promise<StatsSnapshot> {
    const preview = options.preview === true;
    const context = {
        guildId,
        requestKey: statsRequestKey(guildId, filters),
        position: filters.position,
        recent: filters.recent,
        minGames: filters.minGames
    };
    let seasonSelection: RecordSeasonSelection;
    let players: GuildPlayerRecords[];
    let allGames: PlayerGame[];
    let recordedGames: { id: string; durationSec: number | null; kills: number | null }[];
    if (preview) {
        seasonSelection = mockRecordSeasons(filters.seasonId);
        if (guildId !== 'devGuild001') return { ...context, ...seasonSelection, empty: true };
        players = listMockGuildPlayers(options.champion ?? (await defaultChampionResolver()));
        allGames = players.flatMap((player) => player.games);
        recordedGames = [];
    } else {
        if (!db) throw new Error('통계 조회 DB가 필요합니다.');
        await requireGuildView(actor, guildId, { db });
        const champion = options.champion ?? (await defaultChampionResolver());
        const result = await getGuildRecords(db, actor, guildId, champion, filters.seasonId);
        ({ players, allGames, recordedGames } = result);
        seasonSelection = { seasons: result.seasons, selectedSeasonId: result.selectedSeasonId };
        if (!recordedGames.length) return { ...context, ...seasonSelection, empty: true };
    }

    const scoped = players.map(({ games, ...player }) => ({
        ...player,
        games: filters.position === 'all' ? games : games.filter((game) => game.position === filters.position)
    }));
    const rows = scoped.flatMap(({ games, ...player }) => {
        const summary = summarize(games);
        return summary ? [{ ...player, ...summary }] : [];
    });
    // 업적 정책이 확정되기 전에는 기존 개발 샘플만 업적을 제공한다.
    const achievements = preview
        ? rankAchievements(
              scoped.map(({ games, ...player }) => ({
                  ...player,
                  summary: summarize(filters.recent ? games.slice(0, RECENT_GAMES) : games)
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
        ...context,
        ...seasonSelection,
        empty: false,
        showAchievements: preview,
        kpis: {
            // 실제 기록은 출전자 수와 무관하게 완료 Game 행으로 센다.
            games: preview ? Math.round(allGames.length / 10) : recordedGames.length,
            players: players.filter((player) => player.games.length).length,
            averageDurationSec: preview
                ? Math.round((totalMinutes * 60) / allGames.length)
                : durationGames.length
                  ? Math.round(
                        durationGames.reduce((sum, game) => sum + game.durationSec!, 0) / durationGames.length
                    )
                  : null,
            // 킬·시간이 모두 검증된 Game만 같은 분자와 분모에 포함한다.
            killsPerMinute: preview
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
        leaderboard: rows
            .filter((row) => row.games >= filters.minGames)
            .map((row) => ({ ...row, badges: badges.get(row.userId) ?? [] })),
        playerCount: rows.length,
        champions: championRecords(
            filters.position === 'all'
                ? allGames
                : allGames.filter((game) => game.position === filters.position)
        )
    };
}
