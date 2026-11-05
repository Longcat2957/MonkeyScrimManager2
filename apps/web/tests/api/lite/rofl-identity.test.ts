import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoflIdentity } from '../../../src/lib/server/rofl/identity.ts';
import { RoflError } from '../../../src/lib/server/rofl/format.ts';
import { replayBytes, replayPlayer } from '../support/rofl-fixtures.ts';

const players = () => Array.from({ length: 10 }, (_, index) => replayPlayer('Player' + index, 'KR1', index));
const invalid = (error: unknown) => error instanceof RoflError && error.code === 'INVALID_METADATA';

test('ROFL 팀별 명시된 다섯 포지션을 서비스 포지션으로 변환한다', () => {
    const identities = readRoflIdentity(replayBytes(players()));
    assert.deepEqual(
        identities.map((row) => row.position),
        ['top', 'jungle', 'mid', 'bot', 'support', 'top', 'jungle', 'mid', 'bot', 'support']
    );
    assert.deepEqual(
        identities.map((row) => row.replayTeamId),
        [100, 100, 100, 100, 100, 200, 200, 200, 200, 200]
    );
});

test('참가자 배열을 섞어도 명시된 팀과 포지션을 읽고 원본 인덱스를 보존한다', () => {
    const original = players();
    const shuffled = [7, 1, 9, 0, 5, 3, 8, 4, 6, 2].map((index) => original[index]!);
    const result = readRoflIdentity(replayBytes(shuffled));
    assert.deepEqual(result[0], { participantIndex: 0, replayTeamId: 200, position: 'mid' });
    assert.deepEqual(result[3], { participantIndex: 3, replayTeamId: 100, position: 'top' });
    assert.deepEqual(
        result.map((row) => row.participantIndex),
        Array.from({ length: 10 }, (_, index) => index)
    );
});

test('누락·null·빈 값·NONE 포지션은 챔피언이나 PLAYER_ROLE로 추정하지 않는다', () => {
    for (const value of [undefined, null, '', 'NONE']) {
        const source = players().map((player) => ({
            ...player,
            TEAM_POSITION: value,
            PLAYER_ROLE: 'TOP',
            SKIN: 'Garen'
        }));
        assert.ok(readRoflIdentity(replayBytes(source)).every((row) => row.position === null));
    }
});

test('잘못된 포지션 값과 같은 팀의 중복 포지션은 명시적 파싱 오류다', () => {
    for (const value of ['SUPPORT', 'MID', 'top', 0, {}, true]) {
        const source = players().map((player, index) =>
            index === 0 ? { ...player, TEAM_POSITION: value } : player
        );
        assert.throws(() => readRoflIdentity(replayBytes(source)), invalid);
    }
    const duplicate = players().map((player, index) =>
        index === 1 ? { ...player, TEAM_POSITION: 'TOP' } : player
    );
    assert.throws(() => readRoflIdentity(replayBytes(duplicate)), invalid);
});

test('양 팀 다섯 명 조건과 정수 팀 식별자를 벗어난 메타데이터는 거절한다', () => {
    const source = players();
    for (const rows of [
        source.slice(0, 9),
        [...source, source[0]!],
        source.map((player) => ({ ...player, TEAM: '100', TEAM_POSITION: 'NONE' }))
    ]) {
        assert.throws(() => readRoflIdentity(replayBytes(rows)), invalid);
    }
    for (const team of [0, -1, 100.5, true, 'blue']) {
        assert.throws(
            () =>
                readRoflIdentity(
                    replayBytes(
                        source.map((player, index) => (index === 0 ? { ...player, TEAM: team } : player))
                    )
                ),
            invalid
        );
    }
});
