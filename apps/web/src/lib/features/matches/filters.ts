export type MatchArchiveFilters = {
    q?: string;
    player?: string;
    champion?: string;
    championIds?: string[];
    bestOf?: number | null;
    seasonId?: string | null;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
};

export function matchSearchTerms(q = ''): string[] {
    return q.trim().slice(0, 50).split(/\s+/u).filter(Boolean);
}

export type MatchDateFilters = {
    from: string;
    to: string;
    error: string | null;
    fromInclusive: Date | null;
    toExclusive: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function calendarDate(value: string): Date | null {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) return null;
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date
        : null;
}

/** 날짜만 받는 필터는 한국 시각의 하루로 해석하며 알 수 없는 경기 시각을 보충하지 않는다. */
export function parseMatchDateFilters(input: { from?: string | null; to?: string | null }): MatchDateFilters {
    const from = input.from ?? '';
    const to = input.to ?? '';
    const start = from ? calendarDate(from) : null;
    const end = to ? calendarDate(to) : null;
    let error: string | null = null;
    if (from && !start) error = '시작일을 올바른 날짜(YYYY-MM-DD)로 입력해 주세요';
    else if (to && !end) error = '종료일을 올바른 날짜(YYYY-MM-DD)로 입력해 주세요';
    else if (start && end && start > end) error = '종료일을 시작일과 같거나 이후로 선택해 주세요';
    return {
        from,
        to,
        error,
        fromInclusive: !error && start ? new Date(start.getTime() - KST_OFFSET_MS) : null,
        toExclusive: !error && end ? new Date(end.getTime() + DAY_MS - KST_OFFSET_MS) : null
    };
}
