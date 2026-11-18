import type {
    GameDetail,
    GamePlayer,
    LoadoutIcon,
    MatchDetail,
    MatchListItem
} from '#lib/features/matches/types.ts';
import {
    matchSearchTerms,
    parseMatchDateFilters,
    type MatchArchiveFilters
} from '#lib/features/matches/filters.ts';
import { DomainError } from '#lib/server/errors.ts';
import { mockRecordSeasons } from '#lib/server/records/seasons.ts';
import sample from './fixtures/rofl-sample.json' with { type: 'json' };
import { TEAM_NAMES } from '#lib/features/scrims/settings.ts';
import { findMockScrim, findMockScrimRecord, type MockFailure } from './scrims.ts';
import { syncMockBracketResult } from './bracket.ts';

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
    plannedBlueTeamSlot: 'a' | 'b' | null;
    revision: number;
    // 게임 기록 없이 점수만 아는 조회용 경기의 점수다. 게임이 있으면 게임으로 센다.
    fixedScore?: [number, number];
    cancelledByScrim?: boolean;
    games: StoredGame[];
};

/** 편성·대진에서 막 시작한 개발 경기도 고유한 상세 화면을 갖는다. */
export function createMockMatch(input: Omit<StoredMatch, 'id' | 'games' | 'revision'>): string {
    const id = `devMatch-${crypto.randomUUID()}`;
    matches.push({ ...input, id, games: [], revision: 0 });
    return id;
}

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
    plannedBlueTeamSlot: null,
    revision: 0,
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
    // 지난 시리즈에도 최종 승부를 결정한 세트를 두어 목록과 상세가 같은 점수를 보여 준다.
    ...Array.from({ length: 22 }, (_, index): StoredMatch => {
        const week = Math.floor(index / 2);
        const played = new Date(Date.UTC(2026, 9, 10 - week * 7, 11 + (index % 2) * 2)).toISOString();
        const bestOf = [5, 3, 1][index % 3]!;
        const winners: ('a' | 'b')[] =
            bestOf === 5 ? ['a', 'b', 'a', 'b', 'a'] : bestOf === 3 ? ['b', 'a', 'b'] : ['a'];
        return base(
            `devMatchOld${index + 1}`,
            'devScrim005',
            `${9 - Math.floor(week / 4)}월 ${(week % 4) + 1}주차 정기 내전`,
            TEAM_NAMES[(index % 2) * 2]!,
            TEAM_NAMES[(index % 2) * 2 + 1]!,
            bestOf,
            index === 7 ? 'cancelled' : 'completed',
            index === 21 ? null : played,
            index === 7 ? [] : winners
        );
    })
];

export function hasMockScrimMatch(guildId: string, scrimId: string): boolean {
    return matches.some(
        (match) => match.guildId === guildId && match.scrimId === scrimId && !match.cancelledByScrim
    );
}

function score(match: StoredMatch): [number, number] {
    if (match.cancelledByScrim) return [0, 0];
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
    const { id, scrimTitle, teamA, teamB, bestOf, status } = match;
    // 점수만 있는 조회 샘플의 날짜는 명시된 fixture이며 업로드·예약 시각에서 추정하지 않는다.
    const playedAt = match.cancelledByScrim
        ? null
        : match.games.length
          ? (match.games.flatMap((game) => (game.playedAt ? [game.playedAt] : [])).sort()[0] ?? null)
          : match.playedAt;
    return { id, scrimTitle, teamA, teamB, scoreA, scoreB, bestOf, status, playedAt };
}

const byPlayed = (a: MatchListItem, b: MatchListItem) =>
    (b.playedAt ?? '').localeCompare(a.playedAt ?? '') || a.id.localeCompare(b.id);

export async function listMockRecentMatches(
    guildId: string,
    { fail = false, limit = 5 } = {}
): Promise<MatchListItem[]> {
    if (fail) throw new Error('목 데이터: 최근 경기 조회 실패 재현');
    return (await listMockMatches(guildId, { page: 1, pageSize: limit })).matches;
}

export async function listMockMatches(guildId: string, options: MatchArchiveFilters) {
    const seasons = mockRecordSeasons(options.seasonId);
    const dates = parseMatchDateFilters(options);
    if (dates.error) throw new DomainError('INVALID_INPUT', dates.error);
    const terms = matchSearchTerms(options.q).map((term) => term.toLowerCase());
    const player = options.player?.trim().toLowerCase();
    const champion = options.champion?.trim().toLowerCase();
    const archive = matches.flatMap((match) => {
        if (match.guildId !== guildId || match.status !== 'completed' || !match.games.length) return [];
        const scrim = findMockScrimRecord(guildId, match.scrimId);
        if (!scrim || scrim.status === 'cancelled') return [];
        const item = toListItem(match);
        const target = Math.floor(match.bestOf / 2) + 1;
        return Math.max(item.scoreA, item.scoreB) === target && Math.min(item.scoreA, item.scoreB) < target
            ? [{ item, games: match.games }]
            : [];
    });
    const filtered = archive
        .filter(({ item: match, games }) => {
            if (options.bestOf && match.bestOf !== options.bestOf) return false;
            if (!terms.every((term) => match.scrimTitle.toLowerCase().includes(term))) return false;
            if (player || champion) {
                const set = games.find((game) =>
                    game.raw.participants.some(
                        (pick) =>
                            (!player ||
                                (pick.userId && pick.riotId.gameName?.toLowerCase().includes(player))) &&
                            (!champion ||
                                (pick.champion &&
                                    (pick.champion.toLowerCase().includes(champion) ||
                                        options.championIds?.includes(pick.champion))))
                    )
                );
                if (!set) return false;
                match.matchedGameId = set.id;
            }
            if (!dates.fromInclusive && !dates.toExclusive) return true;
            if (!match.playedAt) return false;
            const playedAt = new Date(match.playedAt);
            return (
                (!dates.fromInclusive || playedAt >= dates.fromInclusive) &&
                (!dates.toExclusive || playedAt < dates.toExclusive)
            );
        })
        .map(({ item }) => item)
        .sort(byPlayed);
    const start = (options.page - 1) * options.pageSize;
    return {
        ...seasons,
        from: dates.from,
        to: dates.to,
        matches: filtered.slice(start, start + options.pageSize),
        total: filtered.length,
        empty: archive.length === 0
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
    earlier: Set<string>
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
                fearlessViolation: match.hardFearless && earlier.has(championId)
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

function usedBy(games: StoredGame[]) {
    const used = new Set<string>();
    for (const game of games) {
        for (const player of game.raw.participants) {
            if (!player.champion) continue;
            used.add(player.champion);
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
    const currentGames = match.cancelledByScrim ? [] : match.games;
    const selected = currentGames.find((game) => game.id === gameId) ?? currentGames.at(-1) ?? null;
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
        games: currentGames.map((game) => ({ id: game.id, order: game.order, winner: winnerOf(game) }))
    };
    const game = selected
        ? toGame(
              match,
              selected,
              resolvers,
              usedBy(match.games.filter((item) => item.order < selected.order))
          )
        : null;
    // 하드 피어리스 진행 중 경기에서 다음 게임에 쓸 수 없는 챔피언이다.
    const used = match.hardFearless && match.status === 'in_progress' ? usedBy(match.games) : null;
    const operating = match.status === 'in_progress';
    const can = {
        upload: operating,
        setSide: operating && Boolean(findMockScrim(guildId, match.scrimId)?.canManage)
    };
    return {
        match: detail,
        game,
        usedChampions: used?.size ? [...used].map(resolvers.champion) : null,
        operation: {
            plannedBlueTeamSlot: match.plannedBlueTeamSlot,
            nextGameNumber: match.games.length + 1,
            revision: match.revision,
            can
        },
        can
    };
}

type SideInput = { expectedRevision: number; nextGameNumber: number; blueTeamSlot: 'a' | 'b' };

function checkNextSet(match: StoredMatch, input: SideInput): MockFailure | null {
    if (input.blueTeamSlot !== 'a' && input.blueTeamSlot !== 'b')
        return { status: 400, message: '이번 세트의 블루 팀을 선택해 주세요' };
    if (
        match.status !== 'in_progress' ||
        input.nextGameNumber !== match.games.length + 1 ||
        input.expectedRevision !== match.revision
    )
        return { status: 409, message: '경기 상태가 바뀌었어요. 현재 세트를 다시 확인해 주세요' };
    return null;
}

export function setMockMatchSide(guildId: string, matchId: string, input: SideInput) {
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (!match) return { status: 404, message: '경기를 찾을 수 없어요' };
    if (!findMockScrim(guildId, match.scrimId)?.canManage)
        return { status: 403, message: '진영을 바꿀 권한이 없어요' };
    const failure = checkNextSet(match, input);
    if (failure) return failure;
    match.plannedBlueTeamSlot = input.blueTeamSlot;
    match.revision++;
    return null;
}

/** 검증을 마친 ROFL 결과를 다음 게임으로 기록한다. 승부가 나면 경기를 종료한다. */
export async function recordMockGame(
    guildId: string,
    matchId: string,
    raw: RawGame,
    input: SideInput & { blueTeamConfirmed: boolean }
): Promise<MockFailure | { order: number; revision: number; completed: boolean }> {
    await wait();
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (!match) return { status: 404, message: '경기를 찾을 수 없어요' };
    const failure = checkNextSet(match, input);
    if (failure) return failure;
    if (!input.blueTeamConfirmed)
        return { status: 400, message: '블루·레드 팀이 실제 진영과 맞는지 확인해 주세요' };
    const signature = signatureOf(raw);
    const duplicate = match.games.find((game) => game.signature === signature);
    if (duplicate) return { status: 409, message: `이미 ${duplicate.order}게임으로 기록된 파일이에요` };
    const order = match.games.length + 1;
    match.games.push({
        id: `${match.id}-g${order}`,
        order,
        playedAt: null,
        blueSlot: input.blueTeamSlot,
        raw,
        signature
    });
    const [a, b] = score(match);
    if (Math.max(a, b) > match.bestOf / 2) match.status = 'completed';
    match.plannedBlueTeamSlot = null;
    const revision = ++match.revision;
    const completed = match.status === 'completed';
    await syncMockBracketResult(guildId, match.scrimId, match.id, a, b, match.status);
    return { order, revision, completed };
}

/** 내전 중도 종료·되돌리기에 맞춰 경기 상태만 바꾼다. 기록된 게임은 그대로 둔다. */
export function setMockMatchStatus(guildId: string, matchId: string, status: MatchListItem['status']) {
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (match && match.status !== status) {
        match.status = status;
        match.revision++;
    }
}

/** 원본 결과는 보존하지만 취소한 내전의 현재 점수·게임 목록에서는 제외한다. */
export function cancelMockMatchResults(guildId: string, matchId: string) {
    const match = matches.find((item) => item.guildId === guildId && item.id === matchId);
    if (match)
        Object.assign(match, { status: 'cancelled', cancelledByScrim: true, revision: match.revision + 1 });
}
