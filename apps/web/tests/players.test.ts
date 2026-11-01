import assert from 'node:assert/strict';
import test from 'node:test';
import { championRecords, duoRecords, summarize } from '../src/lib/features/players/stats.ts';
import type { PlayerGame } from '../src/lib/features/players/types.ts';
import { findMockPlayer, listMockPlayerGames } from '../src/lib/mocks/players.ts';

const champion = (id: string) => ({ id, name: id, iconUrl: null });
const game = (overrides: Partial<PlayerGame>): PlayerGame => ({
	matchId: 'm', gameId: 'g', scrimTitle: 's', playedAt: '2026-10-01T00:00:00Z', win: true, champion: champion('Ahri'), position: 'mid',
	kills: 5, deaths: 2, assists: 5, cs: 200, damage: 20000, visionScore: 20, teamKills: 20, durationSec: 1200, teammates: [], ...overrides
});

test('요약 지표를 게임 기준으로 계산하고 게임이 없으면 null이다', () => {
	assert.equal(summarize([]), null);
	const summary = summarize([game({}), game({ win: false, kills: 1, deaths: 4, assists: 1, position: 'top' })])!;
	assert.equal(summary.games, 2);
	assert.equal(summary.wins, 1);
	assert.equal(summary.kda, (6 + 6) / 6);
	assert.equal(summary.csPerMin, 400 / 40);
	assert.equal(summary.killParticipation, 12 / 40);
	assert.equal(summary.mainPosition, 'mid');
});

test('챔피언은 게임 수 순으로, 듀오는 표본 기준을 넘긴 사람만 겹치지 않게 고른다', () => {
	const mate = (userId: string) => ({ userId, displayName: userId });
	const games = [
		game({ champion: champion('Zed'), teammates: [mate('a'), mate('b')] }),
		game({ champion: champion('Zed'), teammates: [mate('a'), mate('b')] }),
		game({ win: false, teammates: [mate('a'), mate('b')] }),
		game({ win: false, teammates: [mate('b'), mate('c')] })
	];
	assert.deepEqual(championRecords(games).map((record) => [record.champion.id, record.games]), [['Zed', 2], ['Ahri', 2]]);
	const { best, worst } = duoRecords(games, 3, 1);
	assert.deepEqual(best.map((record) => record.userId), ['a']);
	assert.deepEqual(worst.map((record) => record.userId), ['b']);
});

test('목 사용자 기록은 순위 기록의 포지션·승률을 따르고 매번 같다', () => {
	const player = findMockPlayer('devGuild001', 'u03')!;
	const games = listMockPlayerGames(player, champion);
	assert.deepEqual(games, listMockPlayerGames(player, champion));
	assert.ok(games.every((item) => item.position === 'jungle'));
	assert.equal(findMockPlayer('devGuild002', 'u03'), null);
});
