import type { LolPosition } from '../guild/types.ts';
import { positionsLabel } from '../labels.ts';

// PostgreSQL이 순위와 표본을 결정한다. 여기서는 표시 이름과 단위만 붙인다.
export const SEASON_TITLES = {
    'season-kills': ['킬딸 왕', '세트당 평균 킬 · 10세트 이상', '킬/세트'],
    'season-assists': ['유미 체질', '세트당 평균 어시스트 · 10세트 이상', '어시스트/세트'],
    'season-damage': ['실력그래프 1등', '분당 챔피언 피해량 · 10세트 이상', '피해/분'],
    'season-participation': ['싸움이야 나도 끼어야지', '팀 킬이 있는 세트의 킬 관여율 · 10세트 이상', '%'],
    'season-wards': ['불 좀 꺼줄래?', '분당 제거한 적 와드 · 10세트 이상', '개/분'],
    'season-efficiency': [
        '가성비 킹',
        '팀 내 피해 지분과 골드 지분의 평균 차이 · 같은 포지션 10세트 이상',
        '%p'
    ],
    'season-cs': ['20대 사망원인 1위 한라인만 더', '정글 외 포지션의 분당 CS · 10세트 이상', 'CS/분'],
    'season-tanking': ['에이스 견제', '승리한 세트에서 분당 받은 피해량 · 10승 이상', '피해/분'],
    'season-protection': ['소라카 체질', '분당 아군 회복량과 보호막량의 합 · 10세트 이상', '/분'],
    'season-clean-sheet': ['클린 시트', '0데스로 이긴 세트 수', '승'],
    'season-champion-pool': ['unlucky faker', '승리한 챔피언 종류 수', '종'],
    'season-one-trick': ['원챔', '한 챔피언으로 거둔 최다 승수', '승'],
    'season-positions': ['연체동물 체질', '승리한 출전 포지션 수', '포지션'],
    'season-decider': ['위기에 강함', '정상 종료한 Bo3에서 1:1 뒤 결정 세트 승수', '승'],
    'season-series-rate': ['승리 체질', '정상 종료한 Bo3 시리즈 승률 · 5시리즈 이상', '%']
} as const;

export type SeasonTitleId = keyof typeof SEASON_TITLES;
export type SeasonTitleHolder = {
    titleId: SeasonTitleId;
    position: LolPosition | null;
    score: number;
    sample: number;
    rank: number;
    tied: boolean;
    userId: string;
    displayName: string;
    iconUrl: string | null;
};

export type AchievementRanking = {
    id: string;
    titleId: SeasonTitleId;
    position: LolPosition | null;
    title: string;
    description: string;
    sampleUnit: '세트' | '시리즈';
    entries: (Pick<SeasonTitleHolder, 'userId' | 'displayName' | 'iconUrl' | 'rank' | 'sample' | 'tied'> & {
        value: string;
    })[];
};
export type AchievementBadge = Pick<AchievementRanking, 'id' | 'title'> & { tied: boolean };

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

export function groupSeasonTitles(rows: SeasonTitleHolder[]): AchievementRanking[] {
    const groups = new Map<string, AchievementRanking>();
    for (const { titleId, position, score, ...entry } of rows) {
        const id = position ? `${titleId}:${position}` : titleId;
        const [name, description, unit] = SEASON_TITLES[titleId];
        let group = groups.get(id);
        if (!group) {
            group = {
                id,
                titleId,
                position,
                title: position ? `${name} · ${positionsLabel([position])}` : name,
                description,
                sampleUnit: titleId === 'season-series-rate' ? '시리즈' : '세트',
                entries: []
            };
            groups.set(id, group);
        }
        const sign = unit === '%p' && score > 0 ? '+' : '';
        group.entries.push({ ...entry, value: `${sign}${number.format(score)}${unit}` });
    }
    return [...groups.values()];
}

export function achievementBadges(rankings: AchievementRanking[]): Map<string, AchievementBadge[]> {
    const badges = new Map<string, AchievementBadge[]>();
    for (const { id, title, entries } of rankings) {
        for (const { userId, rank, tied } of entries) {
            if (rank !== 1) continue;
            const list = badges.get(userId);
            const badge = { id, title, tied };
            if (list) list.push(badge);
            else badges.set(userId, [badge]);
        }
    }
    return badges;
}
