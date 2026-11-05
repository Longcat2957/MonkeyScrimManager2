import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import type { GameResolvers } from '../../../../src/lib/features/matches/types.ts';
import { getMatch, listMatches } from '../../../../src/lib/server/matches/queries.ts';
import { champion, createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

const icon = (id: number | null) => (id === null ? null : { id, name: `아이콘 ${id}`, iconUrl: null });
const resolvers: GameResolvers = { champion, item: icon, spell: icon, rune: icon, splash: () => null };

test('경기 목록은 서버·상태·페이지를 구분하고 검색의 SQL 와일드카드를 문자로 취급한다', async (t) => {
    const f = await createGameFixture(t);
    await f.db.update(schema.scrims).set({ title: '100%_내전' }).where(eq(schema.scrims.id, f.scrimId));
    await f.db.insert(schema.matches).values({ ...f.matchValues, status: 'cancelled' });
    await f.createGame(f.db, 1, f.match.id, 'a', { startedAt: new Date('2026-10-01T10:00:00Z') });
    const all = await listMatches(f.db, null, f.guildId, { status: 'all', page: 1, pageSize: 20 });
    assert.equal(all.total, 2);
    assert.equal(all.matches.find((match) => match.id === f.match.id)?.scoreA, 1);
    assert.equal(all.matches.find((match) => match.id === f.match.id)?.playedAt, '2026-10-01T10:00:00.000Z');
    assert.equal(
        (await listMatches(f.db, null, f.guildId, { status: 'in_progress', q: '%_', page: 1, pageSize: 20 }))
            .total,
        1
    );
    assert.equal(
        (await listMatches(f.db, null, f.guildId, { status: 'done', page: 1, pageSize: 20 })).total,
        1
    );
    assert.equal(
        (await listMatches(f.db, null, f.guildId, { status: 'all', page: 2, pageSize: 1 })).matches.length,
        1
    );
    assert.equal(
        (await listMatches(f.db, null, f.otherGuildId, { status: 'all', page: 1, pageSize: 20 })).total,
        0
    );
    assert.equal(await getMatch(f.db, null, f.otherGuildId, f.match.id, null, resolvers), null);
    await assert.rejects(
        listMatches(f.db, null, f.guildId, { status: 'all', page: 0, pageSize: 20 }),
        errorCode('INVALID_INPUT')
    );
});

test('경기 상세는 당시 표시값·실제 0·누락 null과 팀별 피어리스를 보존한다', async (t) => {
    const f = await createGameFixture(t);
    const first = await f.createGame(f.db, 1);
    await f.apply(first.id);
    const second = await f.createGame(f.db, 2, f.match.id, 'b', { winnerSide: 'red', durationMs: 0 });
    const target = and(
        eq(schema.roflParticipantDataV1.roflMetadataId, second.roflMetadataId!),
        eq(schema.roflParticipantDataV1.participantIndex, 0)
    );
    const [data] = await f.db.select().from(schema.roflParticipantDataV1).where(target);
    await f.db
        .update(schema.roflParticipantDataV1)
        .set({
            stats: { ...data!.stats, minionsKilled: 0, neutralMinionsKilled: 0, damageDealtToChampions: null }
        })
        .where(target);
    await f.db
        .update(schema.users)
        .set({ username: '바뀐 현재 이름' })
        .where(eq(schema.users.id, f.manager.userId));
    const detail = await getMatch(f.db, null, f.guildId, f.match.id, second.id, resolvers);
    assert.ok(detail?.game);
    assert.equal(detail.match.scoreA, 2);
    assert.equal(detail.game.durationSec, 0);
    assert.equal(detail.game.playedAt, null);
    assert.equal(detail.game.mmrStatus, 'pending');
    const player = detail.game.sides.find((side) => side.slot === 'a')!.players[0]!;
    assert.equal(player.displayName, '당시 이름 0');
    assert.equal(player.riotId, '기록0#KR1');
    assert.equal(player.kills, 0);
    assert.equal(player.cs, 0);
    assert.equal(player.damage, null);
    assert.equal(player.score, null);
    assert.equal(player.items[0]?.id, 0);
    assert.equal(player.items[2], null);
    assert.equal(player.fearlessViolation, true);
    assert.deepEqual(
        detail.usedChampions?.a.map((value) => value.id),
        ['Ahri']
    );
    assert.equal(detail.can.upload, false);
    assert.equal(
        (await getMatch(f.db, null, f.guildId, f.match.id, first.id, resolvers))?.game?.mmrStatus,
        'applied'
    );
});

test('선별 상세가 없는 결과는 수치와 출전자를 합성하지 않는다', async (t) => {
    const f = await createGameFixture(t);
    const [metadata] = await f.db
        .insert(schema.roflMetadata)
        .values({
            fileSha256: randomBytes(32).toString('hex'),
            fileSizeBytes: 100,
            formatVersion: 2,
            gameVersion: '26.21',
            projectionVersion: 1
        })
        .returning();
    const [game] = await f.db
        .insert(schema.games)
        .values({
            scrimId: f.scrimId,
            matchId: f.match.id,
            gameNumber: 1,
            blueTeamSlot: 'a',
            status: 'completed',
            winnerSide: 'blue',
            roflMetadataId: metadata!.id
        })
        .returning();
    const detail = await getMatch(f.db, null, f.guildId, f.match.id, game!.id, resolvers);
    assert.equal(detail?.game?.durationSec, null);
    assert.equal(detail?.game?.mmrStatus, 'pending');
    assert.ok(detail?.game?.sides.every((side) => side.players.length === 0));
    assert.equal(detail?.usedChampions, null);
});

test('아직 결과가 없는 실제 Match는 빈 경기와 빈 피어리스 안내를 반환한다', async (t) => {
    const f = await createGameFixture(t);
    const detail = await getMatch(f.db, null, f.guildId, f.match.id, null, resolvers);
    assert.equal(detail?.game, null);
    assert.deepEqual(detail?.match.games, []);
    assert.equal(detail?.usedChampions, null);
    assert.equal(detail?.match.scoreA, 0);
    assert.equal(detail?.match.scoreB, 0);
});
