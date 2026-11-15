import { desc, eq, sql } from 'drizzle-orm';
import type { RecordSeasonSelection } from '../../features/seasons.ts';
import type { Actor } from '../auth/types.ts';
import { mmrSeasons } from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { DomainError } from '../errors.ts';
import { readGuild } from '../scrims/queries.ts';
import { requireUuid } from '../scrims/validation.ts';

function requestedSeason(value?: string | null) {
    return value == null ? null : requireUuid(value, '시즌').toLowerCase();
}

/** 명시한 시즌은 같은 서버에서만 찾고, 생략하면 활성 시즌만 선택한다. */
export async function selectRecordSeason(
    tx: Transaction,
    guildId: string,
    requested?: string | null
): Promise<RecordSeasonSelection> {
    const id = requestedSeason(requested);
    const rows = await tx
        .select()
        .from(mmrSeasons)
        .where(eq(mmrSeasons.guildId, guildId))
        .orderBy(sql`${mmrSeasons.endedAt} is null desc`, desc(mmrSeasons.startedAt), desc(mmrSeasons.id));
    const selected = id ? rows.find((row) => row.id === id) : rows.find((row) => row.endedAt === null);
    if (id && !selected) throw new DomainError('NOT_FOUND', '이 서버의 시즌을 찾을 수 없어요');
    return {
        seasons: rows.map((row) => ({
            id: row.id,
            name: row.name,
            startedAt: row.startedAt.toISOString(),
            endedAt: row.endedAt?.toISOString() ?? null
        })),
        selectedSeasonId: selected?.id ?? null
    };
}

export async function getRecordSeasons(
    db: Database,
    actor: Actor | null,
    guildId: string,
    requested?: string | null
) {
    return readGuild(db, actor, guildId, (tx) => selectRecordSeason(tx, guildId, requested));
}

/** 개발 샘플에는 실제 시즌 식별자와 과거 자료가 없으므로 이전 숫자를 만들어 제공하지 않는다. */
export function mockRecordSeasons(requested?: string | null): RecordSeasonSelection {
    if (requestedSeason(requested)) throw new DomainError('NOT_FOUND', '이 서버의 시즌을 찾을 수 없어요');
    return { seasons: [], selectedSeasonId: null };
}
