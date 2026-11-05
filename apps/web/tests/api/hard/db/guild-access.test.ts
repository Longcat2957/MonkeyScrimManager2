import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
    assertGuildAccess,
    assertGuildView,
    requireGuildAdmin,
    requireGuildMember,
    requireGuildView
} from '../../../../src/lib/server/guild/access.ts';
import { listAccessibleGuilds } from '../../../../src/lib/server/guild/queries.ts';
import { DiscordError, type DiscordGuild } from '../../../../src/lib/server/discord/client.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';

const domain = (code: DomainError['code']) => (error: unknown) =>
    error instanceof DomainError && error.code === code;

test('비로그인·비소속 사용자도 활성 서버를 열람하고 관리자 힌트는 현재 소속만 따른다', async (t) => {
    const f = await createAccessFixture(t);
    assert.equal((await requireGuildView(null, f.ids.guild, { db: f.db })).isAdmin, false);
    assert.equal(
        (await assertGuildView(f.db, { userId: f.ids.outsider, isServiceAdmin: true }, f.ids.guild)).isAdmin,
        false
    );
    assert.equal((await assertGuildView(f.db, f.owner, f.ids.guild)).isAdmin, true);
    assert.equal((await assertGuildView(f.db, f.member, f.ids.guild)).isAdmin, false);
    await f.db.update(schema.guilds).set({ isActive: false }).where(eq(schema.guilds.id, f.ids.otherGuild));
    await assert.rejects(assertGuildView(f.db, null, f.ids.otherGuild), domain('NOT_FOUND'));
    await assert.rejects(assertGuildView(f.db, null, '잘못된 서버'), domain('NOT_FOUND'));
});

test('관리 권한 회수 후에는 과거 캐시와 서비스 관리자 권한으로 우회하지 못한다', async (t) => {
    const f = await createAccessFixture(t);
    const dependencies = { db: f.db, discord: f.discord };
    assert.equal((await requireGuildAdmin(f.owner, f.ids.guild, dependencies)).isAdmin, true);
    f.guilds.get(f.ids.guild)!.ownerId = f.ids.otherMember;
    await f.db.update(schema.users).set({ isServiceAdmin: true }).where(eq(schema.users.id, f.owner.userId));
    await assert.rejects(
        requireGuildAdmin({ ...f.owner, isServiceAdmin: true }, f.ids.guild, dependencies),
        domain('FORBIDDEN')
    );
    const [stored] = await f.db
        .select()
        .from(schema.guildMembers)
        .where(
            and(eq(schema.guildMembers.guildId, f.ids.guild), eq(schema.guildMembers.userId, f.owner.userId))
        );
    assert.equal(stored!.isAdmin, false);
    assert.equal(stored!.manageGuild, false);
    assert.equal(
        (await f.db.select().from(schema.users).where(eq(schema.users.id, f.owner.userId)))[0]!
            .isServiceAdmin,
        true
    );
});

test('탈퇴 동기화는 해당 서버 소속만 지우고 사용자·다른 소속·과거 참가자를 보존한다', async (t) => {
    const f = await createAccessFixture(t);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: f.ids.guild, title: '과거 내전' })
        .returning();
    const [participant] = await f.db
        .insert(schema.scrimParticipants)
        .values({ scrimId: scrim!.id, userId: f.member.userId, displayName: '과거 이름' })
        .returning();
    f.members.get(f.ids.guild)!.delete(f.member.userId);
    await assert.rejects(
        requireGuildMember(f.member, f.ids.guild, { db: f.db, discord: f.discord }),
        domain('NOT_FOUND')
    );
    const memberships = await f.db
        .select()
        .from(schema.guildMembers)
        .where(eq(schema.guildMembers.userId, f.member.userId));
    assert.deepEqual(
        memberships.map((row) => row.guildId),
        [f.ids.otherGuild]
    );
    assert.equal(
        (await f.db.select().from(schema.users).where(eq(schema.users.id, f.member.userId))).length,
        1
    );
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.scrimParticipants)
                .where(eq(schema.scrimParticipants.id, participant!.id))
        )[0]!.userId,
        f.member.userId
    );
});

test('외부 소속 확인 실패는 저장된 권한을 사용하지 않고 기존 소속을 보존한다', async (t) => {
    const f = await createAccessFixture(t);
    const before = await f.db.select().from(schema.guildMembers);
    await assert.rejects(
        requireGuildAdmin(f.owner, f.ids.guild, {
            db: f.db,
            discord: {
                ...f.discord,
                getMember: async () => {
                    throw new DiscordError(503, '검증용 외부 장애');
                }
            }
        }),
        (error: unknown) => error instanceof DiscordError && error.status === 503
    );
    assert.deepEqual(await f.db.select().from(schema.guildMembers), before);
});

test('쓰기 직전 권한 재검사는 현재 운영 역할 설정을 읽고 다른 서버 설정을 섞지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.ids.guild, operatorRoleId: f.ids.role });
    assert.equal(
        (await f.db.transaction((tx) => assertGuildAccess(tx, f.member, f.ids.guild, true))).isAdmin,
        true
    );
    await assert.rejects(
        f.db.transaction((tx) => assertGuildAccess(tx, f.member, f.ids.otherGuild, true)),
        domain('FORBIDDEN')
    );
    await f.db
        .update(schema.guildDiscordSettings)
        .set({ operatorRoleId: null })
        .where(eq(schema.guildDiscordSettings.guildId, f.ids.guild));
    await assert.rejects(
        f.db.transaction((tx) => assertGuildAccess(tx, f.member, f.ids.guild, true)),
        domain('FORBIDDEN')
    );
});

for (const [name, syncedAt] of [
    ['미확인', null],
    ['만료', new Date(0)]
] as const) {
    test(`${name} 소속은 공개 조회의 관리자 힌트와 쓰기 권한에서 제외한다`, async (t) => {
        const f = await createAccessFixture(t);
        await f.db
            .update(schema.guildMembers)
            .set({ syncedAt })
            .where(
                and(
                    eq(schema.guildMembers.guildId, f.ids.guild),
                    eq(schema.guildMembers.userId, f.owner.userId)
                )
            );
        assert.equal((await assertGuildView(f.db, f.owner, f.ids.guild)).isAdmin, false);
        await assert.rejects(
            f.db.transaction((tx) => assertGuildAccess(tx, f.owner, f.ids.guild, true)),
            domain('SERVICE_UNAVAILABLE')
        );
    });
}

test('길드 목록 확인 실패는 활성 상태를 바꾸지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const before = await f.db.select().from(schema.guilds);
    await assert.rejects(
        listAccessibleGuilds(f.owner, {
            db: f.db,
            discord: {
                ...f.discord,
                listGuilds: async () => {
                    throw new DiscordError(503, '검증용 목록 장애');
                }
            }
        }),
        (error: unknown) => error instanceof DiscordError && error.status === 503
    );
    assert.deepEqual(await f.db.select().from(schema.guilds), before);
});

test('길드 목록은 실제 소속만 반환하고 전체 목록 확인 뒤 떠난 서버를 비활성화한다', async (t) => {
    const f = await createAccessFixture(t);
    f.members.get(f.ids.otherGuild)!.delete(f.member.userId);
    const result = await listAccessibleGuilds(f.member, { db: f.db, discord: f.discord });
    assert.deepEqual(result, [{ id: f.ids.guild, name: '검증 서버' }]);
    f.guilds.delete(f.ids.otherGuild);
    await listAccessibleGuilds(f.owner, { db: f.db, discord: f.discord });
    assert.equal(
        (await f.db.select().from(schema.guilds).where(eq(schema.guilds.id, f.ids.otherGuild)))[0]!.isActive,
        false
    );
    assert.deepEqual(await listAccessibleGuilds(null), []);
});

test('목록 소속 동기화는 동시에 네 서버만 처리한다', async (t) => {
    const f = await createAccessFixture(t);
    const all: DiscordGuild[] = Array.from({ length: 9 }, (_, index) => ({
        id: String(BigInt(f.ids.guild) + 100n + BigInt(index)),
        name: `서버 ${index}`,
        iconHash: null,
        ownerId: f.owner.userId,
        roles: []
    }));
    let running = 0;
    let maximum = 0;
    const result = await listAccessibleGuilds(f.owner, {
        db: f.db,
        discord: {
            ...f.discord,
            listGuilds: async () => all,
            getGuild: async (id) => all.find((guild) => guild.id === id) ?? null,
            getMember: async () => {
                running += 1;
                maximum = Math.max(maximum, running);
                await Promise.resolve();
                running -= 1;
                return { user: f.profile(f.owner.userId), roleIds: [] };
            }
        }
    });
    assert.equal(result.length, 9);
    assert.equal(maximum, 4);
});
