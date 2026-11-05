import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../db/types.ts';
import { discordInteractionReceipts } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { isDiscordId } from './client.ts';

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .filter(([, item]) => item !== undefined)
                .map(([key, item]) => [key, canonical(item)])
        );
    return value;
}

/** 유일키 충돌을 기다린 뒤 같은 업무 결과를 돌려준다. 실패한 트랜잭션에는 기록도 남지 않는다. */
export async function withBotReceipt<T>(
    tx: Transaction,
    context: { interactionId: string; guildId: string; actorId: string; operation: string; payload: unknown },
    work: () => Promise<T>
): Promise<T> {
    if (!isDiscordId(context.interactionId))
        throw new DomainError('INVALID_INPUT', 'interaction 식별자가 올바르지 않아요');
    const requestHash = createHash('sha256')
        .update(
            JSON.stringify(
                canonical({
                    guildId: context.guildId,
                    actorId: context.actorId,
                    operation: context.operation,
                    payload: context.payload
                })
            )
        )
        .digest('hex');
    await tx
        .insert(discordInteractionReceipts)
        .values({
            interactionId: context.interactionId,
            guildId: context.guildId,
            actorId: context.actorId,
            requestHash
        })
        .onConflictDoNothing();
    const [receipt] = await tx
        .select()
        .from(discordInteractionReceipts)
        .where(eq(discordInteractionReceipts.interactionId, context.interactionId))
        .for('update');
    if (!receipt || receipt.requestHash !== requestHash)
        throw new DomainError('CONFLICT', '같은 요청 식별자에 다른 내용이 전달됐어요');
    if (receipt.result !== null) return receipt.result as T;
    const result = await work();
    await tx
        .update(discordInteractionReceipts)
        .set({ result })
        .where(eq(discordInteractionReceipts.interactionId, context.interactionId));
    return result;
}
