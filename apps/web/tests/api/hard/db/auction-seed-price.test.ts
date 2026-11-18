import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import { listGuildMembers } from '../../../../src/lib/server/accounts/queries.ts';
import { guildAuditEntries, guildMembers } from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import { setAuctionDrawPrice } from '../../../../src/lib/server/guild/auction-draw-price.ts';
import { listGuildAudit } from '../../../../src/lib/server/guild/audit.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';

const domain = (code: DomainError['code']) => (error: unknown) =>
    error instanceof DomainError && error.code === code;

test('경매 초기가 설정·해제는 같은 멤버라도 서버별로 독립적이며 실제 변경만 기록한다', async (t) => {
    const f = await createAccessFixture(t);
    const set = (guildId: string, price: number | null) =>
        setAuctionDrawPrice(f.db, f.owner, guildId, f.ids.member, 'seed', price, f.dependencies);
    const price = async (guildId: string) => {
        const result = await listGuildMembers(
            f.db,
            f.owner,
            guildId,
            { q: '', page: 1, pageSize: 20 },
            f.dependencies
        );
        return result.members.find((member) => member.userId === f.ids.member)!.auctionSeedPrice;
    };
    assert.equal(await price(f.ids.guild), null);
    await set(f.ids.guild, 2_147_483_647);
    await set(f.ids.guild, 2_147_483_647);
    await set(f.ids.otherGuild, 1);
    assert.equal(await price(f.ids.guild), 2_147_483_647);
    await set(f.ids.guild, null);
    await set(f.ids.guild, null);
    assert.equal(await price(f.ids.guild), null);
    assert.equal(await price(f.ids.otherGuild), 1);
    const audit = await listGuildAudit(f.db, f.owner, f.ids.guild, { page: 1, pageSize: 20 }, f.dependencies);
    assert.equal(audit.total, 2);
    for (const entry of audit.entries) {
        assert.equal(entry.kind, 'auction_seed_price_changed');
        assert.equal(entry.actor.userId, f.ids.owner);
        assert.equal(entry.target?.userId, f.ids.member);
        assert.equal(entry.account, null);
        assert.equal(entry.setting, null);
        assert.equal(entry.primary, null);
    }
    await withdrawAccount(f.db, f.member, { confirm: true });
    assert.equal(
        (await f.db.select().from(guildMembers).where(eq(guildMembers.userId, f.ids.member))).length,
        0
    );
    await assert.rejects(set(f.ids.otherGuild, 1), domain('NOT_FOUND'));
});

test('경매 초기가는 관리자만 현재 서버의 실제 멤버에게 양의 정수로 지정한다', async (t) => {
    const f = await createAccessFixture(t);
    const set = (actor: typeof f.owner | null, userId: string, price: number | null = 100) =>
        setAuctionDrawPrice(f.db, actor, f.ids.guild, userId, 'seed', price, f.dependencies);
    await assert.rejects(set(null, f.ids.member), domain('UNAUTHENTICATED'));
    await assert.rejects(set(f.member, f.ids.member), domain('FORBIDDEN'));
    await assert.rejects(set(f.owner, f.ids.bot), domain('NOT_FOUND'));
    await assert.rejects(set(f.owner, f.ids.outsider), domain('NOT_FOUND'));
    f.members.get(f.ids.guild)!.delete(f.ids.otherMember);
    await assert.rejects(set(f.owner, f.ids.otherMember), domain('NOT_FOUND'));
    for (const value of [0, -1, 0.5, NaN, 2_147_483_648])
        await assert.rejects(set(f.owner, f.ids.member, value), domain('INVALID_INPUT'));
    await assert.rejects(
        f.pool.query('UPDATE guild_members SET auction_seed_price = 0 WHERE guild_id = $1', [f.ids.guild]),
        { code: '23514', constraint: 'guild_members_auction_seed_price_positive' }
    );
    assert.ok((await f.db.select().from(guildMembers)).every((member) => member.auctionSeedPrice === null));
    assert.equal((await f.db.select().from(guildAuditEntries)).length, 0);
});
