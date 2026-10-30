import type { PrivacyKey, PrivacySettings, RiotAccount, RiotLookup } from '#lib/features/me/types.ts';

// 개발 서버가 살아 있는 동안 유지되는 /me 목 저장소다. 실제 DB·Riot API 연결 전까지 사용한다.
// 조회 시 이름으로 예외를 재현한다: "없는계정" 계정 없음, "조회제한" 조회 제한, "충돌계정" 다른 사용자 연결.

const LATENCY_MS = 500;

let accounts: RiotAccount[] = [
	{ id: 'acc1', gameName: 'Hide on bush', tagLine: 'KR1', region: 'KR', isPrimary: true, inActiveScrim: true },
	{ id: 'acc2', gameName: '원숭이부캐', tagLine: 'KR2', region: 'KR', isPrimary: false, inActiveScrim: false }
];

const privacy: PrivacySettings = { profilePublic: false, showRiotId: false };

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

export type MockFailure = { status: number; message: string };

export function getMockMe(preview: string | null) {
	return {
		riotAccounts: preview === 'empty' ? [] : structuredClone(accounts),
		privacy: { ...privacy }
	};
}

export async function lookupMockRiotAccount(gameName: string, tagLine: string): Promise<RiotLookup | MockFailure> {
	await wait();
	if (gameName === '없는계정') return { status: 404, message: '계정을 찾을 수 없어요' };
	if (gameName === '조회제한') return { status: 503, message: '잠시 후 다시 시도해 주세요' };
	if (gameName === '충돌계정') return { status: 409, message: '이미 다른 사용자에게 연결된 계정이에요' };
	if (accounts.some((a) => a.gameName === gameName && a.tagLine === tagLine)) {
		return { status: 409, message: '이미 연결한 계정이에요' };
	}
	return { puuid: `mock-${gameName}-${tagLine}`, gameName, tagLine, region: 'KR' };
}

export async function linkMockRiotAccount(lookup: RiotLookup) {
	await wait();
	accounts.push({
		id: lookup.puuid,
		gameName: lookup.gameName,
		tagLine: lookup.tagLine,
		region: lookup.region,
		isPrimary: accounts.length === 0,
		inActiveScrim: false
	});
}

export async function setMockPrimary(id: string) {
	await wait();
	accounts = accounts.map((a) => ({ ...a, isPrimary: a.id === id }));
}

export async function unlinkMockRiotAccount(id: string): Promise<MockFailure | null> {
	await wait();
	const target = accounts.find((a) => a.id === id);
	if (!target) return { status: 404, message: '이미 해제된 계정이에요' };
	if (target.inActiveScrim) return { status: 409, message: '진행 중인 내전에 쓰이는 계정은 해제할 수 없어요' };
	accounts = accounts.filter((a) => a.id !== id);
	if (target.isPrimary && accounts[0]) accounts[0].isPrimary = true;
	return null;
}

export async function setMockPrivacy(key: PrivacyKey, value: boolean) {
	await wait();
	privacy[key] = value;
}
