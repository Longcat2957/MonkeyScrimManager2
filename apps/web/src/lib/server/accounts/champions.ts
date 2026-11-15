import { and, asc, eq } from 'drizzle-orm';
import {
    CHAMPION_PREFERENCE_POSITIONS,
    MAX_PREFERRED_CHAMPIONS,
    emptyChampionPreferenceSelections,
    type ChampionPreferenceInput,
    type ChampionPreferenceOption,
    type ChampionPreferenceSelections,
    type MyChampionPreferences
} from '../../features/me/champions.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import { userChampionPreferences, users } from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { CHAMPION_CATALOG_ERROR, getChampionPreferenceCatalog } from '../ddragon/champion-preferences.ts';
import { DomainError } from '../errors.ts';

type Dependencies = { catalog?: () => Promise<ChampionPreferenceOption[]> };

export function validateChampionPreferenceInput(input: ChampionPreferenceInput): ChampionPreferenceInput {
    if (
        !input ||
        !CHAMPION_PREFERENCE_POSITIONS.includes(input.position) ||
        !Array.isArray(input.championIds)
    )
        throw new DomainError('INVALID_INPUT', '선호 챔피언의 포지션과 목록을 다시 확인해 주세요');
    if (input.championIds.length > MAX_PREFERRED_CHAMPIONS)
        throw new DomainError('INVALID_INPUT', '한 포지션에는 선호 챔피언을 최대 10개까지 저장할 수 있어요');
    if (input.championIds.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647))
        throw new DomainError('INVALID_INPUT', '선호 챔피언을 목록에서 다시 선택해 주세요');
    if (new Set(input.championIds).size !== input.championIds.length)
        throw new DomainError('INVALID_INPUT', '같은 챔피언을 한 포지션에 중복해서 저장할 수 없어요');
    return { position: input.position, championIds: [...input.championIds] };
}

function requireActiveUser(row: typeof users.$inferSelect | undefined) {
    if (!row || row.withdrawnAt !== null) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
}

async function selections(tx: Transaction, userId: string): Promise<ChampionPreferenceSelections> {
    const result = emptyChampionPreferenceSelections();
    const rows = await tx
        .select()
        .from(userChampionPreferences)
        .where(eq(userChampionPreferences.userId, userId))
        .orderBy(
            asc(userChampionPreferences.position),
            asc(userChampionPreferences.ordinal),
            asc(userChampionPreferences.championId)
        );
    for (const row of rows) result[row.position].push(row.championId);
    return result;
}

/** 본인 설정은 카탈로그 장애에도 유지하며 신규 선택지만 다시 불러오도록 한다. */
export async function getMyChampionPreferences(
    db: Database,
    actor: Actor | null,
    dependencies: Dependencies = {}
): Promise<MyChampionPreferences> {
    const user = requireUser(actor);
    const preferences = await db.transaction(
        async (tx) => {
            const [row] = await tx.select().from(users).where(eq(users.id, user.userId));
            requireActiveUser(row);
            return selections(tx, user.userId);
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' }
    );
    try {
        return {
            preferences,
            catalog: await (dependencies.catalog ?? getChampionPreferenceCatalog)(),
            catalogError: null
        };
    } catch {
        return { preferences, catalog: [], catalogError: CHAMPION_CATALOG_ERROR };
    }
}

/** 같은 사용자 저장·탈퇴를 직렬화하고 이번 포지션의 순서 있는 목록만 원자 교체한다. */
export async function replaceMyChampionPreferences(
    db: Database,
    actor: Actor | null,
    input: ChampionPreferenceInput,
    dependencies: Dependencies = {}
): Promise<ChampionPreferenceSelections> {
    const user = requireUser(actor);
    const { position, championIds } = validateChampionPreferenceInput(input);
    const [profile] = await db.select().from(users).where(eq(users.id, user.userId));
    requireActiveUser(profile);
    let catalog: ChampionPreferenceOption[] = [];
    if (championIds.length) {
        try {
            catalog = await (dependencies.catalog ?? getChampionPreferenceCatalog)();
        } catch {
            throw new DomainError('SERVICE_UNAVAILABLE', CHAMPION_CATALOG_ERROR);
        }
    }
    const known = new Set(catalog.map((champion) => champion.championId));
    return db.transaction(async (tx) => {
        const [row] = await tx.select().from(users).where(eq(users.id, user.userId)).for('no key update');
        requireActiveUser(row);
        const current = await selections(tx, user.userId);
        // 현재 포지션에 이미 남은 미확인 항목은 보존할 수 있지만 다른 곳에 새로 추가하지 않는다.
        const existing = new Set(current[position]);
        if (championIds.some((id) => !known.has(id) && !existing.has(id)))
            throw new DomainError(
                'INVALID_INPUT',
                '목록에서 확인할 수 없는 챔피언이 있어요. 다시 선택해 주세요'
            );
        if (JSON.stringify(current[position]) === JSON.stringify(championIds)) return current;
        await tx
            .delete(userChampionPreferences)
            .where(
                and(
                    eq(userChampionPreferences.userId, user.userId),
                    eq(userChampionPreferences.position, position)
                )
            );
        if (championIds.length)
            await tx.insert(userChampionPreferences).values(
                championIds.map((championId, index) => ({
                    userId: user.userId,
                    position,
                    championId,
                    ordinal: index + 1
                }))
            );
        current[position] = championIds;
        return current;
    });
}
