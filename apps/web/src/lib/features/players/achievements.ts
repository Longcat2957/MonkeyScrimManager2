import type { PlayerSummary } from './types.ts';

// 업적은 서버 사람들의 요약 지표를 한 기준으로 줄 세워 1위에게 준다.
// 기준과 이름은 임시이며 업적 정책이 정해지면 바꾼다.

// 업적은 표본이 너무 작은 사람을 빼고 고른다. 서버 홈과 서버 통계가 같은 기준을 쓴다.
export const ACHIEVEMENT_MIN_GAMES = 4;

type Definition = {
    id: string;
    emoji: string;
    title: string;
    description: string;
    /** 줄 세울 값. ascending이면 낮을수록 앞선다. */
    value: (summary: PlayerSummary) => number | null;
    format: (summary: PlayerSummary) => string;
    ascending?: boolean;
};

const fixed = (value: number | null, digits = 1) => value?.toFixed(digits) ?? '—';
const thousands = (value: number | null) =>
    value === null ? '—' : Math.round(value).toLocaleString('ko-KR');
const efficiency = (s: PlayerSummary) =>
    s.damagePerMin !== null && s.goldPerMin !== null && s.goldPerMin > 0
        ? s.damagePerMin / s.goldPerMin
        : null;

export const ACHIEVEMENTS: Definition[] = [
    {
        id: 'dps',
        emoji: '💥',
        title: '딜량 왕',
        description: '분당 챔피언 피해량이 가장 많은 사람',
        value: (s) => s.damagePerMin,
        format: (s) => `${thousands(s.damagePerMin)} /분`
    },
    {
        id: 'gold',
        emoji: '💰',
        title: '골드 왕',
        description: '분당 골드 획득이 가장 많은 사람',
        value: (s) => s.goldPerMin,
        format: (s) => `${thousands(s.goldPerMin)} G/분`
    },
    {
        id: 'cs',
        emoji: '🌾',
        title: 'CS 왕',
        description: '분당 CS가 가장 많은 사람',
        value: (s) => s.csPerMin,
        format: (s) => `${fixed(s.csPerMin)} CS/분`
    },
    {
        id: 'vision',
        emoji: '👁️',
        title: '천리안',
        description: '게임당 시야 점수가 가장 높은 사람',
        value: (s) => s.visionPerGame,
        format: (s) => `시야 ${fixed(s.visionPerGame)}`
    },
    {
        id: 'tank',
        emoji: '🛡️',
        title: '샌드백',
        description: '분당 받은 피해량이 가장 많은 사람',
        value: (s) => s.damageTakenPerMin,
        format: (s) => `${thousands(s.damageTakenPerMin)} /분`
    },
    {
        id: 'efficiency',
        emoji: '🪙',
        title: '가성비 왕',
        description: '골드 대비 피해량이 가장 높은 사람',
        value: (s) => efficiency(s),
        format: (s) => `골드당 피해 ${fixed(efficiency(s), 2)}`
    },
    {
        id: 'slayer',
        emoji: '⚔️',
        title: '학살자',
        description: '게임당 킬이 가장 많은 사람',
        value: (s) => s.kills,
        format: (s) => `게임당 ${fixed(s.kills)}킬`
    },
    {
        id: 'helper',
        emoji: '🤝',
        title: '도우미',
        description: '게임당 어시스트가 가장 많은 사람',
        value: (s) => s.assists,
        format: (s) => `게임당 ${fixed(s.assists)}어시`
    },
    {
        id: 'survivor',
        emoji: '🧘',
        title: '불사신',
        description: '게임당 데스가 가장 적은 사람',
        value: (s) => s.deaths,
        format: (s) => `게임당 ${fixed(s.deaths)}데스`,
        ascending: true
    },
    {
        id: 'feeder',
        emoji: '🪦',
        title: '우물 밖은 위험해',
        description: '게임당 데스가 가장 많은 사람',
        value: (s) => s.deaths,
        format: (s) => `게임당 ${fixed(s.deaths)}데스`
    },
    {
        id: 'teamfight',
        emoji: '🔥',
        title: '한타 중독',
        description: '킬 관여율이 가장 높은 사람',
        value: (s) => s.killParticipation,
        format: (s) => `킬 관여 ${Math.round((s.killParticipation ?? 0) * 100)}%`
    },
    {
        id: 'kda',
        emoji: '🎯',
        title: 'KDA 장인',
        description: 'KDA가 가장 높은 사람',
        value: (s) => s.kda,
        format: (s) => `KDA ${fixed(s.kda, 2)}`
    },
    {
        id: 'pool',
        emoji: '🎭',
        title: '만물박사',
        description: '가장 많은 챔피언을 플레이한 사람',
        value: (s) => s.champions,
        format: (s) => `챔피언 ${s.champions}개`
    },
    {
        id: 'winner',
        emoji: '🍀',
        title: '승리 요정',
        description: '승률이 가장 높은 사람',
        value: (s) => s.wins / s.games,
        format: (s) => `승률 ${Math.round((s.wins / s.games) * 100)}%`
    },
    {
        id: 'streak',
        emoji: '📈',
        title: '폼 미쳤다',
        description: '가장 길게 연승한 사람',
        value: (s) => s.winStreak,
        format: (s) => `${s.winStreak}연승`
    },
    {
        id: 'multikill',
        emoji: '🌋',
        title: '아직 한 발 남았다',
        description: '한 게임 최다 킬 기록을 가진 사람',
        value: (s) => s.maxKills,
        format: (s) => `최다 ${s.maxKills}킬`
    }
];

export type AchievementEntry = {
    userId: string;
    displayName: string;
    iconUrl: string | null;
    value: string;
    games: number;
};
export type AchievementRanking = {
    id: string;
    emoji: string;
    title: string;
    description: string;
    entries: AchievementEntry[];
};
export type AchievementBadge = { id: string; emoji: string; title: string };

type Candidate = {
    userId: string;
    displayName: string;
    iconUrl: string | null;
    summary: PlayerSummary | null;
};

/** 업적마다 minGames 이상 뛴 사람을 줄 세워 앞에서 limit명을 고른다. 대상이 없는 업적은 뺀다. */
export function rankAchievements(
    candidates: Candidate[],
    minGames: number,
    limit = 10
): AchievementRanking[] {
    const eligible = candidates.filter(
        (item): item is Candidate & { summary: PlayerSummary } => (item.summary?.games ?? 0) >= minGames
    );
    return ACHIEVEMENTS.flatMap(({ value, format, ascending, ...achievement }) => {
        const sorted = eligible
            .filter((item) => value(item.summary) !== null && Number.isFinite(value(item.summary)))
            .sort(
                (a, b) =>
                    (value(b.summary)! - value(a.summary)!) * (ascending ? -1 : 1) ||
                    b.summary.games - a.summary.games
            );
        const entries = sorted.slice(0, limit).map(({ userId, displayName, iconUrl, summary }) => ({
            userId,
            displayName,
            iconUrl,
            value: format(summary),
            games: summary.games
        }));
        return entries.length ? [{ ...achievement, entries }] : [];
    });
}

/** 사용자별로 1위를 차지한 업적 배지. */
export function achievementBadges(rankings: AchievementRanking[]): Map<string, AchievementBadge[]> {
    const badges = new Map<string, AchievementBadge[]>();
    for (const { id, emoji, title, entries } of rankings) {
        const winner = entries[0];
        if (winner) badges.set(winner.userId, [...(badges.get(winner.userId) ?? []), { id, emoji, title }]);
    }
    return badges;
}
