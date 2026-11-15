import type { LolPosition } from '../guild/types.ts';
import type { AchievementBadge, AchievementRanking } from '../players/achievements.ts';
import type { ChampionRecord, PlayerSummary } from '../players/types.ts';
import type { RecordSeasonSelection } from '../seasons.ts';

const POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support'] as const;

export type StatsFilters = {
    seasonId: string | null;
    position: LolPosition | 'all';
    recent: boolean;
    minGames: number;
};

export type StatsLeaderboardRow = PlayerSummary & {
    userId: string;
    identityKey?: string;
    displayName: string;
    iconUrl: string | null;
    badges: AchievementBadge[];
};

export type StatsKpis = {
    games: number;
    players: number;
    averageDurationSec: number | null;
    killsPerMinute: number | null;
    kda: number | null;
    champions: number | null;
};

type StatsContext = RecordSeasonSelection & {
    guildId: string;
    requestKey: string;
    position: StatsFilters['position'];
    recent: boolean;
    minGames: number;
};

export type StatsSnapshot = StatsContext &
    (
        | { empty: true }
        | {
              empty: false;
              showAchievements: boolean;
              kpis: StatsKpis;
              achievements: (AchievementRanking & { splashUrl: string | null })[];
              achievementMinGames: number;
              leaderboard: StatsLeaderboardRow[];
              playerCount: number;
              champions: ChampionRecord[];
          }
    );

/** 통계의 기존 URL 기본값·보정 규칙을 초기 조회와 자동 갱신에서 함께 사용한다. */
export function normalizeStatsFilters(search: URLSearchParams): StatsFilters {
    const requested = search.get('position') as LolPosition;
    return {
        seasonId: search.get('season'),
        position: POSITIONS.includes(requested) ? requested : 'all',
        recent: search.get('recent') === '1',
        minGames: Math.min(50, Math.max(1, Math.floor(Number(search.get('min'))) || 5))
    };
}

/** 실제 요청 조건을 비교하며 무관한 URL 값이나 쿼리 순서로 응답 문맥을 바꾸지 않는다. */
export function statsRequestKey(guildId: string, filters: StatsFilters): string {
    return JSON.stringify([guildId, filters.seasonId, filters.position, filters.recent, filters.minGames]);
}

/** 같은 조건의 최신 수치만 바뀌면 열린 화면과 로컬 쪽·정렬을 보존한다. */
export function statsViewKey(
    snapshot: Pick<StatsSnapshot, 'guildId' | 'selectedSeasonId' | 'position' | 'recent' | 'minGames'>
): string {
    return JSON.stringify([
        snapshot.guildId,
        snapshot.selectedSeasonId,
        snapshot.position,
        snapshot.recent,
        snapshot.minGames
    ]);
}

const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
const count = (value: unknown) => finite(value) && Number.isInteger(value) && Number(value) >= 0;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const position = (value: unknown) => POSITIONS.some((entry) => entry === value);
const champion = (value: unknown) =>
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    nullableString(value.iconUrl);
const badge = (value: unknown) =>
    object(value) && ['id', 'emoji', 'title'].every((key) => typeof value[key] === 'string');
const SUMMARY_NUMBERS = [
    'kills',
    'deaths',
    'assists',
    'kda',
    'csPerMin',
    'damagePerMin',
    'goldPerMin',
    'damageTakenPerMin',
    'visionPerGame',
    'killParticipation',
    'champions',
    'maxKills',
    'winStreak',
    'lossStreak'
] as const;

/** 불완전한 갱신 응답은 마지막 정상 화면을 대체하지 않는다. 문맥 일치는 호출자가 별도로 검사한다. */
export function isStatsSnapshot(value: unknown): value is StatsSnapshot {
    if (
        !object(value) ||
        typeof value.guildId !== 'string' ||
        typeof value.requestKey !== 'string' ||
        !nullableString(value.selectedSeasonId) ||
        !(value.position === 'all' || position(value.position)) ||
        typeof value.recent !== 'boolean' ||
        !count(value.minGames) ||
        Number(value.minGames) < 1 ||
        Number(value.minGames) > 50 ||
        !Array.isArray(value.seasons) ||
        !value.seasons.every(
            (season) =>
                object(season) &&
                ['id', 'name'].every((key) => typeof season[key] === 'string') &&
                date(season.startedAt) &&
                (season.endedAt === null || date(season.endedAt))
        )
    )
        return false;
    try {
        const request: unknown = JSON.parse(value.requestKey);
        if (
            !Array.isArray(request) ||
            request.length !== 5 ||
            request[0] !== value.guildId ||
            !nullableString(request[1]) ||
            request[2] !== value.position ||
            request[3] !== value.recent ||
            request[4] !== value.minGames ||
            (request[1] !== null && request[1].toLowerCase() !== value.selectedSeasonId)
        )
            return false;
    } catch {
        return false;
    }
    if (value.empty === true) return true;
    if (
        value.empty !== false ||
        typeof value.showAchievements !== 'boolean' ||
        !object(value.kpis) ||
        !count(value.kpis.games) ||
        !count(value.kpis.players) ||
        !['averageDurationSec', 'killsPerMinute', 'kda', 'champions'].every((key) =>
            nullableNumber((value.kpis as Record<string, unknown>)[key])
        ) ||
        !count(value.achievementMinGames) ||
        !count(value.playerCount) ||
        !Array.isArray(value.achievements) ||
        !value.achievements.every(
            (item) =>
                badge(item) &&
                object(item) &&
                typeof item.description === 'string' &&
                nullableString(item.splashUrl) &&
                Array.isArray(item.entries) &&
                item.entries.every(
                    (entry) =>
                        object(entry) &&
                        ['userId', 'displayName', 'value'].every((key) => typeof entry[key] === 'string') &&
                        nullableString(entry.iconUrl) &&
                        count(entry.games)
                ) &&
                unique(item.entries.map((entry) => entry.userId))
        ) ||
        !Array.isArray(value.leaderboard) ||
        !value.leaderboard.every(
            (row) =>
                object(row) &&
                typeof row.userId === 'string' &&
                (row.identityKey === undefined || typeof row.identityKey === 'string') &&
                typeof row.displayName === 'string' &&
                nullableString(row.iconUrl) &&
                count(row.games) &&
                count(row.wins) &&
                SUMMARY_NUMBERS.every((key) => nullableNumber(row[key])) &&
                (row.mainPosition === null || position(row.mainPosition)) &&
                Array.isArray(row.badges) &&
                row.badges.every(badge) &&
                unique(row.badges.map((entry) => entry.id))
        ) ||
        !Array.isArray(value.champions) ||
        !value.champions.every(
            (record) =>
                object(record) &&
                champion(record.champion) &&
                count(record.games) &&
                count(record.wins) &&
                nullableNumber(record.kda)
        )
    )
        return false;
    return (
        unique(value.leaderboard.map((row) => row.identityKey ?? row.userId)) &&
        unique(value.champions.map((record) => record.champion.id)) &&
        unique(value.achievements.map((item) => item.id))
    );
}
