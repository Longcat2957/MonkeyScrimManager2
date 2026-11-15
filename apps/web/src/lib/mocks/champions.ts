import {
    emptyChampionPreferenceSelections,
    MAX_PREFERRED_CHAMPIONS,
    type ChampionPreferenceInput,
    type MyChampionPreferences
} from '#lib/features/me/champions.ts';
import {
    CHAMPION_CATALOG_ERROR,
    getChampionPreferenceCatalog
} from '#lib/server/ddragon/champion-preferences.ts';
import { DomainError } from '#lib/server/errors.ts';

let preferences = emptyChampionPreferenceSelections();

export async function getMockChampionPreferences(): Promise<MyChampionPreferences> {
    try {
        return {
            preferences: structuredClone(preferences),
            catalog: await getChampionPreferenceCatalog(),
            catalogError: null
        };
    } catch {
        return {
            preferences: structuredClone(preferences),
            catalog: [],
            catalogError: CHAMPION_CATALOG_ERROR
        };
    }
}

export async function replaceMockChampionPreferences(input: ChampionPreferenceInput) {
    if (
        input.championIds.length > MAX_PREFERRED_CHAMPIONS ||
        new Set(input.championIds).size !== input.championIds.length
    )
        throw new DomainError(
            'INVALID_INPUT',
            '한 포지션에는 서로 다른 챔피언을 최대 10개까지 선택해 주세요'
        );
    if (input.championIds.length) {
        const catalog = await getChampionPreferenceCatalog();
        if (input.championIds.some((id) => !catalog.some((entry) => entry.championId === id)))
            throw new DomainError('INVALID_INPUT', '챔피언 선택을 다시 확인해 주세요');
    }
    preferences = { ...preferences, [input.position]: [...input.championIds] };
    return structuredClone(preferences);
}

export function clearMockChampionPreferences() {
    preferences = emptyChampionPreferenceSelections();
}
