import { and, desc, eq, isNull } from 'drizzle-orm';
import type { BotRotateSeasonInput, BotSeasonSnapshot } from '../../../../../../shared/bot-api.js';
import type { Database, Transaction } from '../db/types.ts';
import { guilds, mmrSeasons } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess, requireGuildAdmin } from '../guild/access.ts';
import type { ScrimAccessDependencies } from '../scrims/service.ts';
import { requireUuid } from '../scrims/validation.ts';
import { botActor } from './bot-service.ts';
import { withBotReceipt } from './bot-receipts.ts';
import { isDiscordId } from './client.ts';

async function snapshot(tx: Transaction, guildId: string): Promise<BotSeasonSnapshot> {
    const rows = await tx
        .select()
        .from(mmrSeasons)
        .where(eq(mmrSeasons.guildId, guildId))
        .orderBy(desc(mmrSeasons.startedAt), desc(mmrSeasons.id));
    const seasons = rows.map((row) => ({
        id: row.id,
        name: row.name,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null
    }));
    return {
        current: seasons.find((season) => season.endedAt === null) ?? null,
        completed: seasons.filter((season) => season.endedAt !== null)
    };
}

function validateGuild(guildId: string) {
    if (!isDiscordId(guildId)) throw new DomainError('INVALID_INPUT', '서버 식별자가 올바르지 않아요');
}

/** 관리자용 /시즌 명령이 소비하는 현재·과거 시즌 조회다. 공개 전적 조회 계약은 바꾸지 않는다. */
export async function getBotSeasons(
    db: Database,
    guildId: string,
    actorId: string,
    access?: ScrimAccessDependencies
): Promise<BotSeasonSnapshot> {
    validateGuild(guildId);
    const actor = botActor(actorId);
    await requireGuildAdmin(actor, guildId, { ...access, db });
    return db.transaction(async (tx) => {
        await assertGuildAccess(tx, actor, guildId, true);
        return snapshot(tx, guildId);
    });
}

/** MSM1처럼 이전 시즌 종료와 다음 시즌 생성을 함께 커밋하고 기존 내전의 시즌·점수는 유지한다. */
export async function rotateBotSeason(
    db: Database,
    guildId: string,
    input: BotRotateSeasonInput,
    access?: ScrimAccessDependencies
): Promise<BotSeasonSnapshot> {
    validateGuild(guildId);
    const actor = botActor(input.actorId);
    requireUuid(input.expectedCurrentSeasonId, '현재 시즌');
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100)
        throw new DomainError('INVALID_INPUT', '새 시즌 이름은 1~100자로 입력해 주세요');
    if (input.confirm !== true)
        throw new DomainError('INVALID_INPUT', '현재 시즌 종료와 새 시즌 시작을 확인해 주세요');
    const name = input.name.trim();
    await requireGuildAdmin(actor, guildId, { ...access, db });
    return db.transaction((tx) =>
        withBotReceipt(
            tx,
            {
                ...input,
                guildId,
                operation: 'rotate-season',
                payload: { name, expectedCurrentSeasonId: input.expectedCurrentSeasonId, confirm: true }
            },
            async () => {
                // 최초 시즌 준비와 직렬화하되 receipt의 guild 외래키 잠금과 충돌하지 않는다.
                await tx
                    .select({ id: guilds.id })
                    .from(guilds)
                    .where(eq(guilds.id, guildId))
                    .for('no key update');
                await assertGuildAccess(tx, actor, guildId, true);
                const [current] = await tx
                    .select()
                    .from(mmrSeasons)
                    .where(and(eq(mmrSeasons.guildId, guildId), isNull(mmrSeasons.endedAt)))
                    .for('update');
                if (!current)
                    throw new DomainError(
                        'CONFLICT',
                        '진행 중인 시즌이 없어요. 서버 초기 설정을 확인해 주세요'
                    );
                if (current.id !== input.expectedCurrentSeasonId)
                    throw new DomainError(
                        'CONFLICT',
                        '현재 시즌이 바뀌었어요. 시즌을 다시 조회하고 확인해 주세요'
                    );
                const now = new Date();
                if (current.startedAt > now)
                    throw new DomainError('CONFLICT', '현재 시즌의 시작 시각을 확인해 주세요');
                await tx.update(mmrSeasons).set({ endedAt: now }).where(eq(mmrSeasons.id, current.id));
                await tx.insert(mmrSeasons).values({ guildId, name, startedAt: now });
                // 요청 receipt가 실행자·이전/다음 시즌 결과·처리 시각을 같은 트랜잭션에 보존한다.
                return snapshot(tx, guildId);
            }
        )
    );
}
