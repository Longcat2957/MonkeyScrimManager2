import { and, eq } from 'drizzle-orm';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import { guildMembers } from '../db/schema.ts';
import type { Database } from '../db/types.ts';
import { isDiscordId } from '../discord/client.ts';
import { DomainError } from '../errors.ts';
import {
    assertGuildAccess,
    requireGuildAdmin,
    requireGuildMember,
    type GuildAccessDependencies
} from './access.ts';
import { writeGuildAudit } from './audit.ts';

export async function setAuctionDrawPrice(
    db: Database,
    actor: Actor | null,
    guildId: string,
    userId: string,
    kind: 'seed' | 'override',
    price: number | null,
    access: Partial<GuildAccessDependencies> = {}
): Promise<void> {
    const user = requireUser(actor);
    const dependencies = { ...access, db };
    await requireGuildAdmin(user, guildId, dependencies);
    if (!isDiscordId(userId)) throw new DomainError('NOT_FOUND', '멤버를 찾을 수 없어요');
    if (price !== null && (!Number.isInteger(price) || price < 1 || price > 2_147_483_647))
        throw new DomainError('INVALID_INPUT', '금액은 1~2,147,483,647P 범위로 입력해 주세요');
    const target = { userId, isServiceAdmin: false };
    if (userId !== user.userId) await requireGuildMember(target, guildId, dependencies);
    await db.transaction(async (tx) => {
        const where = and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId));
        const column = kind === 'override' ? 'auctionOverridePrice' : 'auctionSeedPrice';
        const [member] = await tx
            .select({ price: guildMembers[column] })
            .from(guildMembers)
            .where(where)
            .for('no key update');
        if (!member) throw new DomainError('NOT_FOUND', '멤버를 찾을 수 없어요');
        await assertGuildAccess(tx, user, guildId, true);
        if (userId !== user.userId) await assertGuildAccess(tx, target, guildId);
        if (member.price === price) return;
        await tx
            .update(guildMembers)
            .set({ [column]: price })
            .where(where);
        await writeGuildAudit(tx, {
            kind: kind === 'override' ? 'auction_override_price_changed' : 'auction_seed_price_changed',
            guildId,
            actorUserId: user.userId,
            targetUserId: userId
        });
    });
}
