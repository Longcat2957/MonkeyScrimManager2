import type { RiotAccount, RiotLookup } from '#lib/features/me/types.ts';
import { mockPlayers } from './ranking.ts';
import { mockUser } from './session.ts';

// 개발 서버가 살아 있는 동안 유지되는 Riot 계정 연결 목 저장소다. 실제 DB·Riot API 연결 전까지 사용한다.
// 연결은 서버 운영자가 서버 관리에서 지정하고, 본인은 /me에서 보기만 한다.
// 조회 시 이름으로 예외를 재현한다: "없는계정" 계정 없음, "조회제한" 조회 제한, "충돌계정" 다른 사용자 연결.

const LATENCY_MS = 500;

// 사용자 ID → 연결된 계정. 개발자는 두 계정, 그 밖에는 짝수 번째 멤버만 계정 하나를 둔다.
const accounts = new Map<string, RiotAccount[]>([
	[
		mockUser.userId,
		[
			{ id: 'acc1', gameName: 'Hide on bush', tagLine: 'KR1', region: 'KR', isPrimary: true, inActiveScrim: true },
			{ id: 'acc2', gameName: '원숭이부캐', tagLine: 'KR2', region: 'KR', isPrimary: false, inActiveScrim: false }
		]
	],
	...mockPlayers
		.filter((player) => player.userId !== mockUser.userId)
		.flatMap((player, index): [string, RiotAccount[]][] =>
			index % 2 === 0
				? [[player.userId, [{ id: `acc-${player.userId}`, gameName: player.displayName, tagLine: 'KR1', region: 'KR', isPrimary: true, inActiveScrim: false }]]]
				: []
		)
]);

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

export type MockFailure = { status: number; message: string };

/** 사용자에게 연결된 Riot 계정. 대표 계정이 먼저 온다. */
export function listMockRiotAccounts(userId: string): RiotAccount[] {
	return structuredClone(accounts.get(userId) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

export function getMockMe(preview: string | null) {
	return {
		riotAccounts: preview === 'empty' ? [] : listMockRiotAccounts(mockUser.userId)
	};
}

export async function lookupMockRiotAccount(gameName: string, tagLine: string): Promise<RiotLookup | MockFailure> {
	await wait();
	if (gameName === '없는계정') return { status: 404, message: '계정을 찾을 수 없어요' };
	if (gameName === '조회제한') return { status: 503, message: '잠시 후 다시 시도해 주세요' };
	const linked = [...accounts.values()].flat().some((a) => a.gameName === gameName && a.tagLine === tagLine);
	if (gameName === '충돌계정' || linked) return { status: 409, message: '이미 다른 사용자에게 연결된 계정이에요' };
	return { puuid: `mock-${gameName}-${tagLine}`, gameName, tagLine, region: 'KR' };
}

/** 운영자가 사용자에게 계정을 연결한다. 첫 계정이면 대표가 된다. */
export async function linkMockRiotAccount(userId: string, lookup: RiotLookup) {
	await wait();
	const list = accounts.get(userId) ?? [];
	list.push({ id: lookup.puuid, gameName: lookup.gameName, tagLine: lookup.tagLine, region: lookup.region, isPrimary: list.length === 0, inActiveScrim: false });
	accounts.set(userId, list);
}

export async function setMockPrimary(userId: string, id: string): Promise<MockFailure | null> {
	await wait();
	const list = accounts.get(userId);
	if (!list?.some((a) => a.id === id)) return { status: 404, message: '이미 해제된 계정이에요' };
	list.forEach((a) => (a.isPrimary = a.id === id));
	return null;
}

export async function unlinkMockRiotAccount(userId: string, id: string): Promise<MockFailure | null> {
	await wait();
	const list = accounts.get(userId) ?? [];
	const target = list.find((a) => a.id === id);
	if (!target) return { status: 404, message: '이미 해제된 계정이에요' };
	if (target.inActiveScrim) return { status: 409, message: '진행 중인 내전에 쓰이는 계정은 해제할 수 없어요' };
	const rest = list.filter((a) => a.id !== id);
	if (target.isPrimary && rest[0]) rest[0].isPrimary = true;
	accounts.set(userId, rest);
	return null;
}
