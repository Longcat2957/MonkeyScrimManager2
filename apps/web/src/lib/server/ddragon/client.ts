import { RiotError } from '../riot/errors.ts';

export const DATA_DRAGON_ORIGIN = 'https://ddragon.leagueoflegends.com';
export const METADATA_TTL_SECONDS = 300;
export const CATALOG_TTL_SECONDS = 86_400;

const resources = {
	champions: 'champion.json',
	items: 'item.json',
	runes: 'runesReforged.json',
	'summoner-spells': 'summoner.json',
	'profile-icons': 'profileicon.json'
} as const;

export type DataDragonResource = keyof typeof resources;

export interface DataDragonCatalog {
	type?: string;
	version?: string;
	data: Record<string, Record<string, unknown>>;
	[field: string]: unknown;
}

export interface DataDragonRune {
	id: number;
	key: string;
	name: string;
	icon: string;
	[field: string]: unknown;
}

export interface DataDragonRuneTree extends DataDragonRune {
	slots: { runes: DataDragonRune[] }[];
}

export function validateVersion(version: string): string {
	// Numeric releases plus the historical lolpatch_* names in versions.json.
	if (version.length > 32 || !/^(?:\d+\.\d+(?:\.\d+)?|lolpatch_\d+\.\d+)$/.test(version)) {
		throw new RiotError('INVALID_ARGUMENT', '유효한 Data Dragon 버전을 지정해 주세요.');
	}
	return version;
}

function dataPath(version: string, locale: string): string {
	validateVersion(version);
	if (!/^[a-z]{2}_[A-Z]{2}$/.test(locale)) {
		throw new RiotError('INVALID_ARGUMENT', '언어 코드를 ko_KR과 같은 형식으로 지정해 주세요.');
	}
	return `/cdn/${version}/data/${locale}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
}

function isCatalog(value: unknown): value is DataDragonCatalog {
	return isRecord(value) && isRecord(value.data) && Object.values(value.data).every(isRecord);
}

function isRune(value: unknown): value is DataDragonRune {
	return isRecord(value) && typeof value.id === 'number' &&
		['key', 'name', 'icon'].every((field) => typeof value[field] === 'string');
}

function isRunes(value: unknown): value is DataDragonRuneTree[] {
	return Array.isArray(value) && value.every((tree) => isRune(tree) && Array.isArray(tree.slots) &&
		tree.slots.every((slot: unknown) => isRecord(slot) && Array.isArray(slot.runes) && slot.runes.every(isRune)));
}

export function createDataDragonClient(
	fetcher: typeof fetch = globalThis.fetch,
	now: () => number = Date.now,
	timeoutMs = 10_000
) {
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
		throw new RiotError('INVALID_CONFIGURATION', 'Data Dragon 요청 제한 시간이 올바르지 않습니다.');
	}
	const cache = new Map<string, { data: unknown; expiresAt: number }>();
	const pending = new Map<string, Promise<unknown>>();

	async function getJson<T>(path: string, ttl: number, validate: (value: unknown) => value is T): Promise<T> {
		const cached = cache.get(path);
		if (cached && cached.expiresAt > now()) return structuredClone(cached.data) as T;
		cache.delete(path);
		const existing = pending.get(path);
		if (existing) return structuredClone(await existing) as T;
		if (pending.size >= 8) {
			throw new RiotError('BUSY', '정적 데이터 요청이 많습니다. 잠시 후 다시 시도해 주세요.', { retryAfterSeconds: 1 });
		}

		const request = Promise.resolve().then(async () => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetcher(`${DATA_DRAGON_ORIGIN}${path}`, {
					method: 'GET', redirect: 'error', credentials: 'omit',
					headers: { Accept: 'application/json' }, signal: controller.signal
				});
				if (!response.ok) {
					await response.body?.cancel().catch(() => {});
					if (response.status === 404 || response.status === 403) {
						// The CDN also returns 403 for missing versioned objects.
						throw new RiotError('NOT_FOUND', '요청한 정적 데이터를 찾을 수 없습니다.', { upstreamStatus: response.status });
					}
					throw new RiotError('UPSTREAM_ERROR', '정적 데이터 서버에서 오류가 발생했습니다.', { upstreamStatus: response.status });
				}
				let value: unknown;
				try {
					value = await response.json();
				} catch {
					if (controller.signal.aborted) throw new RiotError('TIMEOUT', '정적 데이터 요청 시간이 초과되었습니다.');
					throw new RiotError('INVALID_RESPONSE', '정적 데이터 응답 형식이 올바르지 않습니다.');
				}
				if (!validate(value)) throw new RiotError('INVALID_RESPONSE', '정적 데이터 응답 형식이 올바르지 않습니다.');
				// Finite FIFO cache: callers can request arbitrary valid versions/locales.
				if (cache.size >= 64) cache.delete(cache.keys().next().value!);
				cache.set(path, { data: value, expiresAt: now() + ttl * 1000 });
				return value;
			} catch (error) {
				if (error instanceof RiotError) throw error;
				if (controller.signal.aborted) throw new RiotError('TIMEOUT', '정적 데이터 요청 시간이 초과되었습니다.');
				throw new RiotError('NETWORK_ERROR', '정적 데이터 서버에 연결할 수 없습니다.');
			} finally {
				clearTimeout(timer);
				pending.delete(path);
			}
		});
		pending.set(path, request);
		return structuredClone(await request);
	}

	return {
		getVersions: () => getJson('/api/versions.json', METADATA_TTL_SECONDS, isStringArray),
		getCatalog(version: string, locale: string, resource: string): Promise<DataDragonCatalog | DataDragonRuneTree[]> {
			if (!Object.hasOwn(resources, resource)) {
				throw new RiotError('INVALID_ARGUMENT', '지원하지 않는 정적 데이터 종류입니다.');
			}
			const path = `${dataPath(version, locale)}/${resources[resource as DataDragonResource]}`;
			return resource === 'runes'
				? getJson(path, CATALOG_TTL_SECONDS, isRunes)
				: getJson(path, CATALOG_TTL_SECONDS, isCatalog);
		}
	};
}

export const dataDragon = createDataDragonClient();
