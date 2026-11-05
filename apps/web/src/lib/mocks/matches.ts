import type {
    GameDetail,
    GamePlayer,
    LoadoutIcon,
    MatchDetail,
    MatchListItem,
    MatchStatusFilter
} from '#lib/features/matches/types.ts';
import sample from './fixtures/rofl-sample.json' with { type: 'json' };
import { TEAM_NAMES } from '#lib/features/scrims/settings.ts';
import type { MockFailure } from './scrims.ts';

/** ROFL 투영에서 게임 화면에 필요한 값만 남긴 형태. 업로드한 파일도 같은 형태로 저장한다. */
export type RawGame = {
    gameVersion: string;
    gameLengthMs: number;
    participants: {
        userId?: string | null;
        riotId: { gameName: string | null; tagLine: string | null };
        champion: string | null;
        teamId: number | null;
        win: boolean | null;
        stats: Record<string, number | null>;
        loadout: {
            itemIds: (number | null)[];
            summonerSpellIds: (number | null)[];
            primaryRuneStyleId: number | null;
            secondaryRuneStyleId: number | null;
            keystoneId: number | null;
        };
    }[];
};

type StoredGame = {
    id: string;
    order: number;
    playedAt: string | null;
    blueSlot: 'a' | 'b';
    raw: RawGame;
    signature: string;
};
type StoredMatch = Omit<MatchListItem, 'scoreA' | 'scoreB'> & {
    guildId: string;
    scrimId: string;
    hardFearless: boolean;
    // 게임 기록 없이 점수만 아는 조회용 경기의 점수다. 게임이 있으면 게임으로 센다.
    fixedScore?: [number, number];
    games: StoredGame[];
};

export type GameResolvers = {
    champion: (id: string) => { id: string; name: string; iconUrl: string | null };
    item: (id: number | null) => LoadoutIcon | null;
    spell: (id: number | null) => LoadoutIcon | null;
    rune: (id: number | null) => LoadoutIcon | null;
    splash: (championId: string) => string | null;
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 200));
const signatureOf = (raw: RawGame) =>
    `${raw.gameLengthMs}:${raw.participants.map((player) => player.champion).join(',')}`;

// 같은 샘플을 여러 게임에 쓰므로 두 번째 게임부터는 챔피언을 바꿔 피어리스 위반으로 보이지 않게 한다.
const ROTATION = [
    ['Garen', 'LeeSin', 'Ahri', 'Jinx', 'Leona', 'Darius', 'Viego', 'Syndra', 'Kaisa', 'Nautilus'],
    ['Fiora', 'Graves', 'Zed', 'Ezreal', 'Lulu', 'Sett', 'Kindred', 'Lux', 'Ashe', 'Nami']
];

function sampleFor(index: number): RawGame {
    const raw = sample as RawGame;
    if (index === 0) return raw;
    const champions = ROTATION[(index - 1) % ROTATION.length]!;
    return {
        ...raw,
        participants: raw.participants.map((player, slot) => ({
            ...player,
            champion: champions[slot] ?? player.champion
        }))
    };
}

// 샘플 게임은 레드(200)가 이긴다. 이긴 팀이 레드 진영이 되도록 A/B 진영을 정한다.
function sampleGames(matchId: string, winners: ('a' | 'b')[], startAt: string | null): StoredGame[] {
    return winners.map((winner, index) => ({
        id: `${matchId}-g${index + 1}`,
        order: index + 1,
        playedAt: startAt ? new Date(Date.parse(startAt) + index * 45 * 60_000).toISOString() : null,
        blueSlot: winner === 'a' ? 'b' : 'a',
        raw: sampleFor(index),
        signature: `sample:${matchId}:${index}`
    }));
}

const base = (
    id: string,
    scrimId: string,
    scrimTitle: string,
    teamA: string,
    teamB: string,
    bestOf: number,
    status: MatchListItem['status'],
    playedAt: string | null,
    winners: ('a' | 'b')[]
): StoredMatch => ({
    guildId: 'devGuild001',
    id,
    scrimId,
    scrimTitle,
    teamA,
    teamB,
    bestOf,
    status,
    playedAt,
    hardFearless: true,
    games: sampleGames(id, winners, playedAt)
});

// 진행 중·종료·중도 종료와 경기 시각 미확인을 한 번씩 포함한다. 팀 이름은 내전 팀 순서대로 붙는 이름을 쓴다.
const matches: StoredMatch[] = [
    base(
        'devMatch001',
        'devScrim004',
        '금요일 칼바람 나락 내전 (초보 환영, 즐겜 위주)',
        '포로팀',
        '칼날부리팀',
        3,
        'in_progress',
        '2026-10-30T12:10:00Z',
        ['a', 'b']
    ),
    base(
        'devMatch002',
        'devScrim005',
        '10월 3주차 정기 내전',
        '포로팀',
        '칼날부리팀',
        3,
        'completed',
        '2026-10-24T11:20:00Z',
        ['a', 'a']
    ),
    base(
        'devMatch003',
        'devScrim005',
        '10월 3주차 정기 내전',
        '돌거북팀',
        '바위게팀',
        3,
        'completed',
        '2026-10-24T13:05:00Z',
        ['b', 'a', 'b']
    ),
    base(
        'devMatch004',
        'devScrim005',
        '10월 2주차 정기 내전',
        '포로팀',
        '칼날부리팀',
        3,
        'ended_early',
        '2026-10-17T11:30:00Z',
        ['a']
    ),
    {
        ...base(
            'devMatch005',
            'devScrim005',
            '10월 2주차 정기 내전',
            '돌거북팀',
            '바위게팀',
            5,
            'completed',
            null,
            []
        ),
        fixedScore: [3, 2]
    },
    // 목록의 검색·필터·쪽 나눔을 확인하기 위한 지난 경기다. 게임 기록은 점수만 둔다.
    ...Array.from({ length: 22 }, (_, index): StoredMatch => {
        const week = Math.floor(index / 2);
        const played = new Date(Date.UTC(2026, 9, 10 - week * 7, 11 + (index % 2) * 2)).toISOString();
        return {
            ...base(
                `devMatchOld${index + 1}`,
                'devScrim005',
                `${9 - Math.floor(week / 4)}월 ${(week % 4) + 1}주차 정기 내전`,
                TEAM_NAMES[(index % 2) * 2]!,
                TEAM_NAMES[(index % 2) * 2 + 1]!,
                index % 3 === 0 ? 5 : 3,
                index === 7 ? 'cancelled' : 'completed',
                played,
                []
            ),
            fixedScore:
                index === 7
                    ? [0, 0]
                    : index % 3 === 0
                      ? [3, index % 2 ? 1 : 2]
                      : [index % 2 ? 0 : 2, index % 2 ? 2 : 1]
        };
    })
];

function score(match: StoredMatch): [number, number] {
    if (match.fixedScore) return match.fixedScore;
    let a = 0;
    let b = 0;
    for (const game of match.games) {
        if (winnerOf(game) === 'a') a++;
        else if (winnerOf(game) === 'b') b++;
    }
    return [a, b];
}

function winnerOf(game: StoredGame): 'a' | 'b' | null {
    const winner = game.raw.participants.find((player) => player.win)?.teamId;
    if (!winner) return null;
    return (winner === 100) === (game.blueSlot === 'a') ? 'a' : 'b';
}

function toListItem(match: StoredMatch): MatchListItem {
    const [scoreA, scoreB] = score(match);
    const { id, scrimTitle, teamA, teamB, bestOf, status, playedAt } = match;
    return { id, scrimTitle, teamA, teamB, scoreA, scoreB, bestOf, status, playedAt };
}

const DONE: MatchListItem['status'][] = ['completed', 'ended_early', 'cancelled'];
const byPlayed = (a: StoredMatch, b: StoredMatch) => (b.playedAt ?? '').localeCompare(a.playedAt ?? '');

export async function listMockRecentMatches(
    guildId: string,
    { fail = false } = {}
): Promise<MatchListItem[]> {
    if (fail) throw new Error('목 데이터: 최근 경기 조회 실패 재현');
    return matches
        .filter((match) => match.guildId === guildId)
        .slice(0, 5)
        .map((match) => toListItem(match));
}

export async function listMockMatches(
    guildId: string,
    options: { status: MatchStatusFilter; q: string; page: number; pageSize: number }
) {
    const q = options.q.trim().toLowerCase();
    const inGuild = matches.filter((match) => match.guildId === guildId);
    const searched = q
        ? inGuild.filter((match) =>
              [match.scrimTitle, match.teamA, match.teamB].some((text) => text.toLowerCase().includes(q))
          )
        : inGuild;
    const of = (filter: MatchStatusFilter) =>
        searched.filter(
            (match) =>
                filter === 'all' ||
                (filter === 'done' ? DONE.includes(match.status) : !DONE.includes(match.status))
        );
    const filtered = of(options.status).sort(byPlayed);
    const start = (options.page - 1) * options.pageSize;
    return {
        matches: filtered.slice(start, start + options.pageSize).map((match) => toListItem(match)),
        total: filtered.length,
        counts: {
            all: of('all').length,
            in_progress: of('in_progress').length,
            done: of('done').length
        } satisfies Record<MatchStatusFilter, number>,
        empty: inGuild.length === 0
    };
}

// 경기 평점과 MVP·ACE에 쓰는 임시 성과 점수다. 평점 기준이 정해지면 바꾼다.
function performance(player: RawGame['participants'][number], teamKills: number, teamDamage: number) {
    const {
        kills = 0,
        deaths = 0,
        assists = 0,
        damageDealtToChampions = 0
    } = player.stats as Record<string, number>;
    const participation = teamKills ? (kills + assists) / teamKills : 0;
    const damageShare = teamDamage ? damageDealtToChampions / teamDamage : 0;
    return (kills + assists) / Math.max(1, deaths) + participation * 4 + damageShare * 6;
}

function toGame(
    match: StoredMatch,
    game: StoredGame,
    resolvers: GameResolvers,
    earlier: Record<'a' | 'b', Set<string>>
): GameDetail {
    const winnerSlot = winnerOf(game);
    const sides = ([100, 200] as const).map((teamId) => {
        const side = teamId === 100 ? 'blue' : 'red';
        const slot: 'a' | 'b' = (teamId === 100) === (game.blueSlot === 'a') ? 'a' : 'b';
        const raws = game.raw.participants.filter((player) => player.teamId === teamId);
        const teamKills = raws.reduce((sum, player) => sum + (player.stats.kills ?? 0), 0);
        const teamDamage = raws.reduce((sum, player) => sum + (player.stats.damageDealtToChampions ?? 0), 0);
        const scored = raws.map((raw) => ({ raw, score: performance(raw, teamKills, teamDamage) }));
        const best = Math.max(...scored.map((item) => item.score));
        const players = scored.map(({ raw, score }, index): GamePlayer => {
            const stats = raw.stats;
            const championId = raw.champion ?? '';
            const name = raw.riotId.gameName ?? '알 수 없음';
            return {
                key: `${game.id}-${teamId}-${index}`,
                userId: raw.userId ?? null,
                displayName: name,
                riotId:
                    raw.riotId.gameName && raw.riotId.tagLine
                        ? `${raw.riotId.gameName}#${raw.riotId.tagLine}`
                        : null,
                champion: resolvers.champion(championId),
                level: stats.level ?? null,
                kills: stats.kills ?? 0,
                deaths: stats.deaths ?? 0,
                assists: stats.assists ?? 0,
                cs:
                    stats.minionsKilled === null && stats.neutralMinionsKilled === null
                        ? null
                        : (stats.minionsKilled ?? 0) + (stats.neutralMinionsKilled ?? 0),
                damage: stats.damageDealtToChampions ?? null,
                damageTaken: stats.damageTaken ?? null,
                gold: stats.goldEarned ?? null,
                visionScore: stats.visionScore ?? null,
                wardsPlaced: stats.wardsPlaced ?? null,
                wardsKilled: stats.wardsKilled ?? null,
                controlWards: stats.controlWardsBought ?? null,
                heal: stats.totalHeal ?? null,
                shield: stats.damageShieldedOnTeammates ?? null,
                largestKillingSpree: stats.largestKillingSpree ?? null,
                multiKills: {
                    double: stats.doubleKills ?? 0,
                    triple: stats.tripleKills ?? 0,
                    quadra: stats.quadraKills ?? 0,
                    penta: stats.pentaKills ?? 0
                },
                items: raw.loadout.itemIds.map(resolvers.item),
                spells: raw.loadout.summonerSpellIds.map(resolvers.spell),
                keystone: resolvers.rune(raw.loadout.keystoneId),
                secondaryStyle: resolvers.rune(raw.loadout.secondaryRuneStyleId),
                score: Math.round(score * 100) / 100,
                badge: score === best ? (winnerSlot === slot ? 'mvp' : 'ace') : null,
                fearlessViolation: match.hardFearless && earlier[slot].has(championId)
            };
        });
        return {
            side,
            slot,
            teamName: slot === 'a' ? match.teamA : match.teamB,
            win: winnerSlot === slot,
            players
        } as const;
    });
    const mvp = sides.flatMap((side) => side.players).find((player) => player.badge === 'mvp');
    return {
        id: game.id,
        order: game.order,
        durationSec: Math.round(game.raw.gameLengthMs / 1000),
        playedAt: game.playedAt,
        patch: game.raw.gameVersion.split('.').slice(0, 2).join('.'),
        // 마지막 게임은 진행 중인 경기에서 아직 MMR 반영을 기다린다.
        mmrStatus: match.status === 'in_progress' && game === match.games.at(-1) ? 'pending' : 'applied',
        splashUrl: mvp ? resolvers.splash(mvp.champion.id) : null,
        sides
    };
}

function usedBy(match: StoredMatch, games: StoredGame[]) {
    const used = { a: new Set<string>(), b: new Set<string>() };
    for (const game of games) {
        for (const player of game.raw.participants) {
            if (!player.champion) continue;
            used[(player.teamId === 100) === (game.blueSlot === 'a') ? 'a' : 'b'].add(player.champion);
        }
    }
    return used;
}

export async function getMockMatch(
    guildId: string,
    matchId: string,
    gameId: string | null,
    resolvers: GameResolvers
) {
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (!match) return null;
    const [scoreA, scoreB] = score(match);
    const selected = match.games.find((game) => game.id === gameId) ?? match.games.at(-1) ?? null;
    const detail: MatchDetail = {
        id: match.id,
        scrim: { id: match.scrimId, title: match.scrimTitle },
        teamA: match.teamA,
        teamB: match.teamB,
        scoreA,
        scoreB,
        bestOf: match.bestOf,
        status: match.status,
        hardFearless: match.hardFearless,
        games: match.games.map((game) => ({ id: game.id, order: game.order, winner: winnerOf(game) }))
    };
    const game = selected
        ? toGame(
              match,
              selected,
              resolvers,
              usedBy(
                  match,
                  match.games.filter((item) => item.order < selected.order)
              )
          )
        : null;
    // 하드 피어리스 진행 중 경기에서 다음 게임에 쓸 수 없는 챔피언이다.
    const used = match.hardFearless && match.status === 'in_progress' ? usedBy(match, match.games) : null;
    return {
        match: detail,
        game,
        usedChampions: used
            ? { a: [...used.a].map(resolvers.champion), b: [...used.b].map(resolvers.champion) }
            : null,
        // TODO: 업로드 권한(운영자·참가자)을 정하면 함께 확인한다.
        can: { upload: match.status === 'in_progress' }
    };
}

/** 검증을 마친 ROFL 결과를 다음 게임으로 기록한다. 승부가 나면 경기를 종료한다. */
export async function recordMockGame(
    guildId: string,
    matchId: string,
    raw: RawGame
): Promise<MockFailure | { order: number }> {
    await wait();
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (!match) return { status: 404, message: '경기를 찾을 수 없어요' };
    if (match.status !== 'in_progress')
        return { status: 409, message: '지금은 이 경기에 업로드할 수 없어요' };
    const signature = signatureOf(raw);
    const duplicate = match.games.find((game) => game.signature === signature);
    if (duplicate) return { status: 409, message: `이미 ${duplicate.order}게임으로 기록된 파일이에요` };
    const order = match.games.length + 1;
    match.games.push({
        id: `${match.id}-g${order}`,
        order,
        playedAt: null,
        blueSlot: order % 2 ? 'a' : 'b',
        raw,
        signature
    });
    const [a, b] = score(match);
    if (Math.max(a, b) > match.bestOf / 2) match.status = 'completed';
    return { order };
}

/** 내전 중도 종료·되돌리기에 맞춰 경기 상태만 바꾼다. 기록된 게임은 그대로 둔다. */
export function setMockMatchStatus(guildId: string, matchId: string, status: MatchListItem['status']) {
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (match) match.status = status;
}
