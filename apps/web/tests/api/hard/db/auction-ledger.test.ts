import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
    auctionAcquisitions,
    auctionActions,
    auctionLots,
    auctions,
    auctionTeams,
    guildMembers,
    scrimParticipants,
    scrims,
    scrimTeams,
    users
} from '../../../../src/lib/server/db/schema.ts';
import { discordAvatarUrl } from '../../../../src/lib/server/discord/avatar.ts';
import { getAuctionLedger } from '../../../../src/lib/server/stats/auction-ledger.ts';
import { createFormationFixture } from '../../support/domain-fixtures.ts';

test('경매 원장은 완료 시각·유효 영입 순서·당시 구매자를 보존하고 모든 역할의 신원을 가린다', async (t) => {
    const { db, guildId, otherGuildId, season, scrimId, teams, participants } = await createFormationFixture(
        t,
        3,
        'auction'
    );
    const at = (seconds: number) => new Date(seconds * 1000);
    const user = (index: number) => participants[index]!.userId!;
    const visible = (index: number) => ({
        id: user(index),
        name: participants[index]!.displayName,
        avatarUrl: `https://cdn.discordapp.com/embed/avatars/${(BigInt(user(index)) >> 22n) % 6n}.png`
    });
    const avatarHash = '19ad7bc91cfa42e3ba30544165887f0a';
    const scope = { scrimId, auctionId: randomUUID() };
    await db.insert(auctions).values({ id: scope.auctionId, scrimId, status: 'in_progress' });
    await db.insert(auctionTeams).values(
        [1, 3, 6].map((index, team) => ({
            ...scope,
            teamId: teams[team]!.id,
            captainParticipantId: participants[index]!.id,
            initialPoints: 500 + team
        }))
    );
    const [privateBuyer] = await db
        .update(users)
        .set({ publicProfile: false, avatarHash })
        .where(eq(users.id, user(0)))
        .returning();
    const [withdrawn] = await db
        .update(users)
        .set({ publicProfile: false, publicRiotIds: false, withdrawnAt: at(1), avatarHash })
        .where(eq(users.id, user(1)))
        .returning();
    await db
        .update(users)
        .set({ avatarHash })
        .where(eq(users.id, user(2)));
    await db
        .update(guildMembers)
        .set({ nickname: '현재 서버 이름' })
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, user(2))));

    async function record({
        player,
        team,
        buyer,
        price,
        draw,
        seconds,
        action,
        voided
    }: {
        player: number;
        team: number;
        buyer?: number;
        price: number | null;
        draw: number;
        seconds: number;
        action?: number;
        voided?: boolean;
    }) {
        const scrimParticipantId = participants[player]!.id;
        const lotId = randomUUID();
        const id = `00000000-0000-4000-8000-${String(draw).padStart(12, '0')}`;
        await db.insert(auctionLots).values({
            ...scope,
            id: lotId,
            scrimParticipantId,
            sequenceNumber: draw,
            status: 'sold',
            openedAt: at(0),
            closedAt: at(seconds)
        });
        await db.insert(auctionAcquisitions).values({
            ...scope,
            id,
            teamId: teams[team]!.id,
            scrimParticipantId,
            lotId,
            method: price === null ? 'manual' : 'auction',
            price,
            buyerParticipantId: buyer === undefined ? null : participants[buyer]!.id,
            acquiredAt: at(seconds),
            voidedAt: voided ? at(seconds) : null,
            voidReason: voided ? '정정' : null
        });
        if (action !== undefined)
            await db.insert(auctionActions).values({
                ...scope,
                kind: price === null ? 'assign_unsold' : 'award',
                sequenceNumber: action,
                scrimParticipantId,
                lotId,
                acquisitionId: id
            });
        return id;
    }
    await record({ player: 9, team: 0, buyer: 0, price: 99, draw: 2, seconds: 5, voided: true });
    const manual = await record({ player: 5, team: 0, price: null, draw: 1, seconds: 30, action: 11 });
    const seven = await record({ player: 0, team: 1, buyer: 3, price: 7, draw: 3, seconds: 20, action: 9 });
    const zero = await record({ player: 4, team: 1, buyer: 7, price: 0, draw: 5, seconds: 20, action: 8 });
    const thirty = await record({ player: 2, team: 0, buyer: 0, price: 30, draw: 4, seconds: 10 });

    const ledger = (person?: string, guild = guildId, seasonId: string | null = season.id) =>
        db.transaction((tx) => getAuctionLedger(tx, guild, seasonId, person));
    assert.deepEqual(await ledger(), []);
    await db
        .update(auctions)
        .set({ status: 'completed', endedAt: at(100) })
        .where(eq(auctions.id, scope.auctionId));
    assert.deepEqual(
        (await ledger(user(5))).map(({ id }) => id),
        [scrimId]
    );
    await db
        .update(scrimParticipants)
        .set({ userId: null })
        .where(eq(scrimParticipants.id, participants[5]!.id));
    const masked = { id: privateBuyer!.publicId, name: '비공개 사용자', avatarUrl: null };
    const expected = {
        id: scrimId,
        title: '팀 편성',
        teams: [
            {
                id: teams[0]!.id,
                name: teams[0]!.name,
                captain: { id: withdrawn!.publicId, name: '탈퇴한 사용자', avatarUrl: null },
                budget: 500,
                signings: [
                    {
                        id: thirty,
                        player: {
                            id: user(2),
                            name: '현재 서버 이름',
                            avatarUrl: discordAvatarUrl(user(2), avatarHash)
                        },
                        buyer: masked,
                        price: 30,
                        acquiredAt: at(10).toISOString(),
                        order: 1
                    },
                    {
                        id: manual,
                        player: { id: null, name: '삭제된 사용자', avatarUrl: null },
                        buyer: null,
                        price: null,
                        acquiredAt: at(30).toISOString(),
                        order: 4
                    }
                ]
            },
            {
                id: teams[1]!.id,
                name: teams[1]!.name,
                captain: visible(3),
                budget: 501,
                signings: [
                    {
                        id: zero,
                        player: visible(4),
                        buyer: visible(7),
                        price: 0,
                        acquiredAt: at(20).toISOString(),
                        order: 2
                    },
                    {
                        id: seven,
                        player: masked,
                        buyer: visible(3),
                        price: 7,
                        acquiredAt: at(20).toISOString(),
                        order: 3
                    }
                ]
            },
            { id: teams[2]!.id, name: teams[2]!.name, captain: visible(6), budget: 502, signings: [] }
        ]
    };
    const olderId = randomUUID();
    await db.insert(scrims).values({ id: olderId, guildId, mmrSeasonId: season.id, title: '먼저 끝난 경매' });
    const [older] = await db
        .insert(auctions)
        .values({ scrimId: olderId, status: 'completed', endedAt: at(50) })
        .returning();
    const [olderTeam] = await db
        .insert(scrimTeams)
        .values({ scrimId: olderId, name: '팀', ordinal: 1 })
        .returning();
    await db
        .insert(auctionTeams)
        .values({ scrimId: olderId, auctionId: older!.id, teamId: olderTeam!.id, initialPoints: 100 });
    const all = await ledger();
    assert.deepEqual(
        all.map(({ id }) => id),
        [scrimId, olderId]
    );
    assert.deepEqual(all[0], expected);
    assert.deepEqual(all[1]!.teams[0]!.captain, null);
    for (const index of [0, 1, 2, 3, 4, 6, 7]) assert.deepEqual(await ledger(user(index)), [expected]);
    for (const index of [5, 8, 9]) assert.deepEqual(await ledger(user(index)), []);
    assert.deepEqual(await ledger(undefined, guildId, null), []);
    assert.deepEqual(await ledger(undefined, guildId, randomUUID()), []);
    assert.deepEqual(await ledger(undefined, otherGuildId), []);
    assert.deepEqual(await ledger(user(0), otherGuildId), []);
    await db.update(scrims).set({ status: 'cancelled' }).where(eq(scrims.id, scrimId));
    assert.deepEqual(
        (await ledger()).map(({ id }) => id),
        [olderId]
    );
    assert.deepEqual(await ledger(user(0)), []);
});
