import type { ChampionRef } from '#lib/features/scrims/formation.ts';
import { championIconUrl, dataDragonSplashUrl } from './assets.ts';
import { dataDragon } from './client.ts';

/**
 * 챔피언 ID를 한국어 이름·아이콘으로 바꾸는 함수를 만든다.
 * 카탈로그를 받지 못하면 ID를 이름 대신 쓰고, 버전이 없으면 아이콘 없이 돌려준다.
 */
export async function championResolver(version: string | null): Promise<(id: string) => ChampionRef> {
	let names: Record<string, string> = {};
	if (version) {
		try {
			const catalog = await dataDragon.getCatalog(version, 'ko_KR', 'champions');
			if (!Array.isArray(catalog)) {
				names = Object.fromEntries(Object.entries(catalog.data).map(([id, champion]) => [id, String(champion.name ?? id)]));
			}
		} catch {
			names = {};
		}
	}
	return (id) => ({ id, name: names[id] ?? id, iconUrl: championIconUrl(version, id) });
}

/**
 * 장식용 배경 아트로 쓸 챔피언 스플래시를 전체 챔피언 중에서 무작위로 고른다.
 * 버전이나 카탈로그를 받지 못하면 배경색만 쓰도록 null을 돌려준다.
 */
export async function randomChampionSplash(version: string | null): Promise<string | null> {
	if (!version) return null;
	try {
		const catalog = await dataDragon.getCatalog(version, 'ko_KR', 'champions');
		if (Array.isArray(catalog)) return null;
		const ids = Object.keys(catalog.data);
		const id = ids[Math.floor(Math.random() * ids.length)];
		return id ? dataDragonSplashUrl(id) : null;
	} catch {
		return null;
	}
}
