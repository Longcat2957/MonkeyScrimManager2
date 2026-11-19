import assert from 'node:assert/strict';
import test from 'node:test';
import { achievementBadges, rankAchievements } from '../src/lib/features/players/achievements.ts';
import { percent } from '../src/lib/features/players/format.ts';
import { championRecords, duoRecords, summarize, topPercents } from '../src/lib/features/players/stats.ts';
import type { PlayerGame } from '../src/lib/features/players/types.ts';
import { findMockPlayer, listMockPlayerGames } from '../src/lib/mocks/players.ts';

const champion = (id: string) => ({ id, name: id, iconUrl: null });
const game = (overrides: Partial<PlayerGame>): PlayerGame => ({
    matchId: 'm',
    gameId: 'g',
    scrimTitle: 's',
    playedAt: '2026-10-01T00:00:00Z',
    win: true,
    champion: champion('Ahri'),
    position: 'mid',
    kills: 5,
    deaths: 2,
    assists: 5,
    cs: 200,
    damage: 20000,
    damageTaken: 15000,
    gold: 9000,
    visionScore: 20,
    teamKills: 20,
    durationSec: 1200,
    teammates: [],
    ...overrides
});

test('요약 지표를 게임 기준으로 계산하고 게임이 없으면 null이다', () => {
    assert.equal(summarize([]), null);
    const summary = summarize([
        game({}),
        game({ win: false, kills: 1, deaths: 4, assists: 1, position: 'top' })
    ])!;
    assert.equal(summary.games, 2);
    assert.equal(summary.wins, 1);
    assert.equal(summary.kda, (6 + 6) / 6);
    assert.equal(summary.csPerMin, 400 / 40);
    assert.equal(summary.killParticipation, 12 / 40);
    assert.equal(summary.mainPosition, 'mid');
});

test('승률과 킬 관여는 원비율을 유지하고 표시할 때만 1%p 단위로 반올림한다', () => {
    const games = Array.from({ length: 12 }, (_, index) =>
        game({ win: index < 7, kills: 3, assists: 4, teamKills: 12 })
    );
    const summary = summarize(games)!;
    assert.equal(percent(summary.wins / summary.games), '58%');
    assert.equal(summary.killParticipation, 7 / 12);
    assert.equal(percent(summary.killParticipation), '58%');

    const noKills = game({ kills: 0, assists: 0 });
    assert.equal(percent(summarize([noKills])!.killParticipation), '0%');
    for (const teamKills of [0, null]) {
        assert.equal(percent(summarize([{ ...noKills, teamKills }])!.killParticipation), '—');
    }
});

test('챔피언은 게임 수 순으로, 듀오는 표본 기준을 넘긴 사람만 겹치지 않게 고른다', () => {
    const mate = (userId: string) => ({ userId, displayName: userId });
    const games = [
        game({ champion: champion('Zed'), teammates: [mate('a'), mate('b')] }),
        game({ champion: champion('Zed'), teammates: [mate('a'), mate('b')] }),
        game({ win: false, teammates: [mate('a'), mate('b')] }),
        game({ win: false, teammates: [mate('b'), mate('c')] })
    ];
    assert.deepEqual(
        championRecords(games).map((record) => [record.champion.id, record.games]),
        [
            ['Zed', 2],
            ['Ahri', 2]
        ]
    );
    const { best, worst } = duoRecords(games, 3, 1);
    assert.deepEqual(
        best.map((record) => record.userId),
        ['a']
    );
    assert.deepEqual(
        worst.map((record) => record.userId),
        ['b']
    );
});

test('목 사용자 기록은 순위 기록의 포지션·승률을 따르고 매번 같다', () => {
    const player = findMockPlayer('devGuild001', 'u03')!;
    const games = listMockPlayerGames(player, champion);
    assert.deepEqual(games, listMockPlayerGames(player, champion));
    assert.ok(games.every((item) => item.position === 'jungle'));
    assert.equal(findMockPlayer('devGuild002', 'u03'), null);
});

test('연승·연패와 최다 킬을 세고, 상위 %는 동점을 같은 순위로 본다', () => {
    const summary = summarize([
        game({ kills: 9 }),
        game({}),
        game({ win: false }),
        game({}),
        game({}),
        game({})
    ])!;
    assert.equal(summary.winStreak, 3);
    assert.equal(summary.lossStreak, 1);
    assert.equal(summary.maxKills, 9);
    const weaker = summarize([game({ win: false, kills: 1, deaths: 5 })])!;
    const percents = topPercents(summary, [summary, summary, weaker, weaker]);
    assert.equal(percents.winRate, 25);
    assert.equal(topPercents(weaker, [summary, summary, weaker, weaker]).deaths, 75);
});

test('같게 표시되는 승률도 원비율로 순위를 정하고 공동 순위와 표본 크기를 반영한다', () => {
    const mine = { ...summarize([game({})])!, wins: 7, games: 12 };
    const ahead = { ...mine, wins: 73, games: 125 };
    const tied = { ...mine, wins: 14, games: 24 };
    const behind = { ...mine, wins: 6 };
    assert.equal(percent(ahead.wins / ahead.games), percent(mine.wins / mine.games));
    const peers = (total: number, rank: number) => [
        mine,
        tied,
        ...Array.from({ length: total - 2 }, (_, i) => (i < rank - 1 ? ahead : behind))
    ];
    assert.equal(topPercents(mine, peers(17, 3)).winRate, 18);
    assert.equal(topPercents(mine, peers(10, 3)).winRate, 30);
    assert.equal(topPercents(mine, peers(25, 7)).winRate, 28);
});

test('업적은 최소 게임 수를 넘긴 사람만 줄 세우고 1위에게 배지를 준다', () => {
    const many = Array.from({ length: 4 }, () => game({ kills: 2, deaths: 1 }));
    const candidates = [
        { userId: 'a', displayName: 'a', iconUrl: null, summary: summarize(many) },
        {
            userId: 'b',
            displayName: 'b',
            iconUrl: null,
            summary: summarize(many.map((item) => ({ ...item, kills: 8, deaths: 6 })))
        },
        { userId: 'c', displayName: 'c', iconUrl: null, summary: summarize([game({ kills: 30 })]) }
    ];
    const rankings = rankAchievements(candidates, 4);
    const of = (id: string) => rankings.find((item) => item.id === id)!.entries.map((entry) => entry.userId);
    assert.deepEqual(of('slayer'), ['b', 'a']);
    assert.deepEqual(of('survivor'), ['a', 'b']);
    assert.ok(
        achievementBadges(rankings)
            .get('b')!
            .some((badge) => badge.id === 'slayer')
    );
    assert.equal(achievementBadges(rankings).has('c'), false);
});

test('누락 통계는 0으로 만들지 않고 지표별로 같은 유효 게임을 분모에 쓴다', () => {
    const summary = summarize([
        game({
            kills: null,
            deaths: null,
            assists: null,
            cs: null,
            damage: null,
            damageTaken: null,
            gold: null,
            visionScore: null,
            teamKills: null,
            position: null,
            playedAt: null
        }),
        game({ kills: 0, deaths: 0, assists: 0, cs: 100, durationSec: 600, damage: null, visionScore: 0 }),
        game({ durationSec: null, cs: 1000, damage: null, visionScore: null })
    ])!;
    assert.equal(summary.kills, 2.5);
    assert.equal(summary.kda, 5);
    assert.equal(summary.csPerMin, 10);
    assert.equal(summary.damagePerMin, null);
    assert.equal(summary.visionPerGame, 0);
    assert.equal(summary.winStreak, null);
    assert.equal(summary.lossStreak, null);
    assert.equal(summary.mainPosition, 'mid');
    const onlyMissing = summarize([
        game({ kills: null, deaths: null, assists: null, champion: champion('unknown'), position: null })
    ])!;
    assert.equal(onlyMissing.kda, null);
    assert.equal(onlyMissing.champions, null);
    assert.equal(onlyMissing.maxKills, null);
    assert.deepEqual(championRecords([game({ champion: champion('unknown') })]), []);
    const missing = { ...summary, kda: null };
    assert.equal(topPercents(missing, [missing, summary]).kda, null);
    assert.equal(topPercents(summary, [missing, summary]).kda, 100);
    const ranks = rankAchievements(
        [{ userId: 'x', displayName: 'x', iconUrl: null, summary: { ...onlyMissing, games: 4 } }],
        4
    );
    assert.ok(ranks.every((ranking) => !['kda', 'slayer', 'pool', 'multikill'].includes(ranking.id)));
});
