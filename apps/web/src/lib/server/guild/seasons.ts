import { and, desc, eq, isNull } from 'drizzle-orm';
import type { GuildSeasonOverview, RotateGuildSeasonInput } from '../../features/seasons.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import { guilds, mmrSeasons } from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { DomainError } from '../errors.ts';
import type { ScrimAccessDependencies } from '../scrims/service.ts';
import { requireUuid } from '../scrims/validation.ts';
import { assertGuildAccess, requireGuildAdmin } from './access.ts';

type ValidatedSeasonRotation = RotateGuildSeasonInput & { confirm: true };

/** 웹과 봇은 같은 이름·확인·현재 시즌 조건을 검증한다. */
export function validateRotateGuildSeasonInput(input: RotateGuildSeasonInput): ValidatedSeasonRotation {
    const expectedCurrentSeasonId = requireUuid(input.expectedCurrentSeasonId, '현재 시즌');
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100)
        throw new DomainError('INVALID_INPUT', '새 시즌 이름은 1~100자로 입력해 주세요');
    if (input.confirm !== true)
        throw new DomainError('INVALID_INPUT', '현재 시즌 종료와 새 시즌 시작을 확인해 주세요');
    return { expectedCurrentSeasonId, name: input.name.trim(), confirm: true };
}

export async function readGuildSeasonSnapshot(
    tx: Transaction,
    guildId: string
): Promise<GuildSeasonOverview> {
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

/** 봇 receipt와 웹 저장 모두 호출자의 트랜잭션 안에서 같은 잠금과 전환을 사용한다. */
export async function rotateGuildSeasonInTransaction(
    tx: Transaction,
    actor: Actor,
    guildId: string,
    input: ValidatedSeasonRotation
): Promise<GuildSeasonOverview> {
    // 최초 시즌 준비와 직렬화하되 receipt의 guild 외래키 잠금과 충돌하지 않는다.
    await tx.select({ id: guilds.id }).from(guilds).where(eq(guilds.id, guildId)).for('no key update');
    await assertGuildAccess(tx, actor, guildId, true);
    const [current] = await tx
        .select()
        .from(mmrSeasons)
        .where(and(eq(mmrSeasons.guildId, guildId), isNull(mmrSeasons.endedAt)))
        .for('update');
    if (!current)
        throw new DomainError('CONFLICT', '진행 중인 시즌이 없어요. 서버 초기 설정을 확인해 주세요');
    if (current.id !== input.expectedCurrentSeasonId)
        throw new DomainError('CONFLICT', '현재 시즌이 바뀌었어요. 시즌을 다시 조회하고 확인해 주세요');
    const now = new Date();
    if (current.startedAt > now) throw new DomainError('CONFLICT', '현재 시즌의 시작 시각을 확인해 주세요');
    await tx.update(mmrSeasons).set({ endedAt: now }).where(eq(mmrSeasons.id, current.id));
    await tx.insert(mmrSeasons).values({ guildId, name: input.name, startedAt: now });
    return readGuildSeasonSnapshot(tx, guildId);
}

/** 관리자 조회는 초기 시즌이나 점수를 만들지 않고 현재·종료된 시즌만 읽는다. */
export async function getGuildSeasons(
    db: Database,
    actor: Actor | null,
    guildId: string,
    access?: ScrimAccessDependencies
): Promise<GuildSeasonOverview> {
    const user = requireUser(actor);
    await requireGuildAdmin(user, guildId, { ...access, db });
    return db.transaction(async (tx) => {
        await assertGuildAccess(tx, user, guildId, true);
        return readGuildSeasonSnapshot(tx, guildId);
    });
}

/** 이전 시즌 종료와 새 시즌 시작을 함께 커밋하며 기존 내전·점수·원장을 바꾸지 않는다. */
export async function rotateGuildSeason(
    db: Database,
    actor: Actor | null,
    guildId: string,
    input: RotateGuildSeasonInput,
    access?: ScrimAccessDependencies
): Promise<GuildSeasonOverview> {
    const user = requireUser(actor);
    const validated = validateRotateGuildSeasonInput(input);
    await requireGuildAdmin(user, guildId, { ...access, db });
    return db.transaction((tx) => rotateGuildSeasonInTransaction(tx, user, guildId, validated));
}
