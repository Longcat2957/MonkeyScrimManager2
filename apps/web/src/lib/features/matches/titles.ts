export const SET_TITLES = {
    'set-top-diff': { name: 'TOP DIFF', metric: 'CS 격차' },
    'set-jungle-clear': { name: '협곡의 진공청소기', metric: '정글 CS 격차' },
    'set-mid-farm': { name: 'unlucky chovy', metric: '분당 CS' },
    'set-bot-carry': { name: '소년가장', metric: '팀 피해량 지분 (%)' },
    'set-support-assists': { name: '혜지야 잘했어', metric: '어시스트' },
    'set-next-faker': { name: 'next faker', metric: '킬 관여율 (%)' },
    'set-losing-damage': { name: '오만이횽이야', metric: '챔피언 피해량' },
    'set-kill-deficit': { name: '하지만 이겼죠?', metric: '팀 킬 열세' },
    'set-pentakill': { name: 'Last Man Standing', metric: '펜타킬' },
    'set-deus-ex-machina': { name: 'Deus Ex Machina', metric: '킬 관여율 (%)' }
} as const;

export const SERIES_TITLES = {
    'bo3-reverse-sweep': '삼꽉의 악마',
    'bo3-bot-duo': '공무원'
} as const;

export type SetTitle = { id: keyof typeof SET_TITLES; value: string };
export type SeriesTitleId = keyof typeof SERIES_TITLES;
