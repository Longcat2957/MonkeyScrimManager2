import type { PlatformRouting } from './transport.ts';

export const AUCTION_FRESH_MS = 40 * 60_000;

// Riot 서버별 시간대: https://support.riotgames.com/en-us/league-of-legends/rewards/league-of-legends-end-of-season-2025-ranked-rewards
const zones = {
    br1: 'America/Sao_Paulo',
    eun1: 'Europe/Warsaw',
    euw1: 'Europe/London',
    jp1: 'Asia/Tokyo',
    kr: 'Asia/Seoul',
    la1: 'America/Mexico_City',
    la2: 'America/Argentina/Buenos_Aires',
    me1: 'Asia/Riyadh',
    na1: 'America/Los_Angeles',
    oc1: 'Australia/Sydney',
    ru: 'Europe/Moscow',
    sg2: 'Asia/Singapore',
    tr1: 'Europe/Istanbul',
    tw2: 'Asia/Taipei',
    vn2: 'Asia/Ho_Chi_Minh'
} satisfies Record<PlatformRouting, string>;
const clocks = new Map<string, Intl.DateTimeFormat>();

export function auctionRankSeason(platform: string | null, date = new Date()): string | null {
    if (!platform || !Object.hasOwn(zones, platform)) return null;
    const timeZone = zones[platform as PlatformRouting];
    let clock = clocks.get(timeZone);
    if (!clock) {
        clock = new Intl.DateTimeFormat('en', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hourCycle: 'h23'
        });
        clocks.set(timeZone, clock);
    }
    const { year, month, day, hour } = Object.fromEntries(
        clock.formatToParts(date).map(({ type, value }) => [type, value])
    );
    const local = `${year}${month}${day}${hour}`;
    // 솔로랭크 전환 공지: https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/
    // https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-8-notes/
    // https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-14-notes/
    if (local >= '2026010812' && local < '2026042900') return '2026-S1';
    if (local >= '2026042912' && local < '2026072900') return '2026-S2';
    // 3시즌은 2027년 1월까지로만 발표됐다. 정확한 종료일이 확인되기 전에는 1월 관측치를 합치지 않는다.
    // https://www.leagueoflegends.com/en-us/news/dev/dev-league-classic/
    if (local >= '2026072912' && local < '2027010100') return '2026-S3';
    return null;
}
