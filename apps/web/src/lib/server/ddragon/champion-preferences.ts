import type { ChampionPreferenceOption } from '../../features/me/champions.ts';
import type { ChampionRef } from '../../features/scrims/formation.ts';
import { DomainError } from '../errors.ts';
import { championIconUrl } from './assets.ts';
import { dataDragon } from './client.ts';

export const CHAMPION_CATALOG_ERROR = '챔피언 검색 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요';
const unavailable = () => new DomainError('SERVICE_UNAVAILABLE', CHAMPION_CATALOG_ERROR);
const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** 숫자 key는 저장용이며 canonical id와 이름·이미지는 실제 카탈로그에서만 얻는다. */
export function parseChampionPreferenceCatalog(value: unknown, version: string): ChampionPreferenceOption[] {
    if (!object(value) || !object(value.data) || !Object.keys(value.data).length) throw unavailable();
    const keys = new Set<number>();
    const options: ChampionPreferenceOption[] = [];
    for (const [id, entry] of Object.entries(value.data)) {
        if (
            !/^[A-Za-z0-9]{1,64}$/.test(id) ||
            !object(entry) ||
            entry.id !== id ||
            typeof entry.key !== 'string' ||
            !/^[1-9]\d*$/.test(entry.key) ||
            typeof entry.name !== 'string' ||
            !entry.name.trim()
        )
            throw unavailable();
        const championId = Number(entry.key);
        if (!Number.isSafeInteger(championId) || championId > 2_147_483_647 || keys.has(championId))
            throw unavailable();
        keys.add(championId);
        options.push({ championId, id, name: entry.name, iconUrl: championIconUrl(version, id) });
    }
    return options.sort(
        (left, right) => left.name.localeCompare(right.name, 'ko-KR') || left.championId - right.championId
    );
}

export async function getChampionPreferenceCatalog(
    version?: string | null
): Promise<ChampionPreferenceOption[]> {
    try {
        const selected = version === undefined ? ((await dataDragon.getVersions())[0] ?? null) : version;
        if (!selected) throw unavailable();
        return parseChampionPreferenceCatalog(
            await dataDragon.getCatalog(selected, 'ko_KR', 'champions'),
            selected
        );
    } catch {
        throw unavailable();
    }
}

/** 경매는 숫자 식별자를 추측하지 않고 실제 카탈로그에 있는 항목만 표시한다. */
export function preferredChampionResolver(catalog: readonly ChampionPreferenceOption[]) {
    const champions = new Map<number, ChampionRef>(
        catalog.map(({ championId, id, name, iconUrl }) => [championId, { id, name, iconUrl }])
    );
    return (championId: number): ChampionRef | null => champions.get(championId) ?? null;
}
