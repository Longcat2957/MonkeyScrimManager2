import type { LolPosition } from '../guild/types.ts';
import { SEASON_TITLES, type AchievementBadge, type AchievementRanking } from '../players/achievements.ts';
import type { ChampionRecord, PlayerSummary } from '../players/types.ts';
import type { RecordSeasonSelection } from '../seasons.ts';

const POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support'] as const;

export type StatsFilters = {
    seasonId: string | null;
    position: LolPosition | 'all';
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
    minGames: number;
};

export type StatsSnapshot = StatsContext &
    (
        | { empty: true }
        | {
              empty: false;
              kpis: StatsKpis;
              achievements: AchievementRanking[];
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
        minGames: Math.min(50, Math.max(1, Math.floor(Number(search.get('min'))) || 5))
    };
}

/** 실제 요청 조건을 비교하며 무관한 URL 값이나 쿼리 순서로 응답 문맥을 바꾸지 않는다. */
export function statsRequestKey(guildId: string, filters: StatsFilters): string {
    return JSON.stringify([guildId, filters.seasonId, filters.position, filters.minGames]);
}

/** 같은 조건의 최신 수치만 바뀌면 열린 화면과 로컬 쪽·정렬을 보존한다. */
export function statsViewKey(
    snapshot: Pick<StatsSnapshot, 'guildId' | 'selectedSeasonId' | 'position' | 'minGames'>
): string {
    return JSON.stringify([
        snapshot.guildId,
        snapshot.selectedSeasonId,
        snapshot.position,
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
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.tied === 'boolean';
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
            request.length !== 4 ||
            request[0] !== value.guildId ||
            !nullableString(request[1]) ||
            request[2] !== value.position ||
            request[3] !== value.minGames ||
            (request[1] !== null && request[1].toLowerCase() !== value.selectedSeasonId)
        )
            return false;
    } catch {
        return false;
    }
    if (value.empty === true) return true;
    if (
        value.empty !== false ||
        !object(value.kpis) ||
        !count(value.kpis.games) ||
        !count(value.kpis.players) ||
        !['averageDurationSec', 'killsPerMinute', 'kda', 'champions'].every((key) =>
            nullableNumber((value.kpis as Record<string, unknown>)[key])
        ) ||
        !count(value.playerCount) ||
        !Array.isArray(value.achievements) ||
        !value.achievements.every(
            (item) =>
                object(item) &&
                typeof item.titleId === 'string' &&
                Object.hasOwn(SEASON_TITLES, item.titleId) &&
                (item.titleId === 'season-efficiency' ? position(item.position) : item.position === null) &&
                item.id === (item.position ? `${item.titleId}:${item.position}` : item.titleId) &&
                typeof item.title === 'string' &&
                typeof item.description === 'string' &&
                (item.sampleUnit === '세트' || item.sampleUnit === '시리즈') &&
                Array.isArray(item.entries) &&
                item.entries.length > 0 &&
                item.entries.every(
                    (entry) =>
                        object(entry) &&
                        ['userId', 'displayName', 'value'].every((key) => typeof entry[key] === 'string') &&
                        nullableString(entry.iconUrl) &&
                        count(entry.rank) &&
                        Number(entry.rank) >= 1 &&
                        Number(entry.rank) <= 10 &&
                        typeof entry.tied === 'boolean' &&
                        (!entry.tied || entry.rank === 1) &&
                        count(entry.sample) &&
                        Number(entry.sample) > 0
                ) &&
                item.entries.some((entry) => entry.rank === 1) &&
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
