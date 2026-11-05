import type { LoadoutIcon } from '#lib/features/matches/types.ts';
import { dataDragonImageUrl, dataDragonRuneIconUrl } from './assets.ts';
import { dataDragon, type DataDragonCatalog, type DataDragonRuneTree } from './client.ts';

export type LoadoutResolver = {
    item: (id: number | null) => LoadoutIcon | null;
    spell: (id: number | null) => LoadoutIcon | null;
    rune: (id: number | null) => LoadoutIcon | null;
};

const imageOf = (entry: Record<string, unknown>) => (entry.image as { full?: unknown } | undefined)?.full;

/**
 * 아이템·소환사 주문·룬 ID를 한국어 이름과 아이콘으로 바꾸는 함수를 만든다.
 * 카탈로그를 받지 못하면 아이콘 없이 ID만 돌려 화면이 빈 칸 대신 자리를 유지하게 한다.
 */
export async function loadoutResolver(version: string | null): Promise<LoadoutResolver> {
    const items = new Map<number, LoadoutIcon>();
    const spells = new Map<number, LoadoutIcon>();
    const runes = new Map<number, LoadoutIcon>();
    if (version) {
        const [itemCatalog, spellCatalog, runeTrees] = await Promise.allSettled([
            dataDragon.getCatalog(version, 'ko_KR', 'items'),
            dataDragon.getCatalog(version, 'ko_KR', 'summoner-spells'),
            dataDragon.getCatalog(version, 'ko_KR', 'runes')
        ]);
        if (itemCatalog.status === 'fulfilled' && !Array.isArray(itemCatalog.value)) {
            for (const [id, entry] of Object.entries((itemCatalog.value as DataDragonCatalog).data)) {
                const full = imageOf(entry);
                items.set(Number(id), {
                    id: Number(id),
                    name: String(entry.name ?? id),
                    iconUrl: typeof full === 'string' ? dataDragonImageUrl(version, 'item', full) : null
                });
            }
        }
        if (spellCatalog.status === 'fulfilled' && !Array.isArray(spellCatalog.value)) {
            for (const entry of Object.values((spellCatalog.value as DataDragonCatalog).data)) {
                const id = Number(entry.key);
                const full = imageOf(entry);
                spells.set(id, {
                    id,
                    name: String(entry.name ?? id),
                    iconUrl: typeof full === 'string' ? dataDragonImageUrl(version, 'spell', full) : null
                });
            }
        }
        if (runeTrees.status === 'fulfilled' && Array.isArray(runeTrees.value)) {
            for (const tree of runeTrees.value as DataDragonRuneTree[]) {
                for (const rune of [tree, ...tree.slots.flatMap((slot) => slot.runes)]) {
                    runes.set(rune.id, {
                        id: rune.id,
                        name: rune.name,
                        iconUrl: dataDragonRuneIconUrl(rune.icon)
                    });
                }
            }
        }
    }
    const lookup = (map: Map<number, LoadoutIcon>) => (id: number | null) =>
        id ? (map.get(id) ?? { id, name: String(id), iconUrl: null }) : null;
    return { item: lookup(items), spell: lookup(spells), rune: lookup(runes) };
}
