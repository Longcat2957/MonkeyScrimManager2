import type { MockFailure } from './scrims.ts';
import { mockPlayers } from './ranking.ts';
import { mockUser } from './session.ts';

// 서버 관리 화면의 멤버·관리자 목록(가변, 재시작 시 초기화). 서비스에 연결된 멤버만 담는다.
type Member = { userId: string; displayName: string; isAdmin: boolean };

const members = new Map<string, Member[]>([
	[
		'devGuild001',
		mockPlayers.slice(0, 30).map(({ userId, displayName }) => ({ userId, displayName, isAdmin: userId === mockUser.userId || userId === 'u02' }))
	]
]);

const wait = () => new Promise((resolve) => setTimeout(resolve, 200));

export function listMockMembers(guildId: string, options: { q: string; page: number; pageSize: number }) {
	const all = members.get(guildId) ?? [];
	const q = options.q.trim().toLowerCase();
	// 관리자를 먼저, 같으면 이름 순으로 보여 준다.
	const filtered = (q ? all.filter((member) => member.displayName.toLowerCase().includes(q)) : all)
		.slice()
		.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.displayName.localeCompare(b.displayName, 'ko'));
	const start = (options.page - 1) * options.pageSize;
	return {
		members: filtered.slice(start, start + options.pageSize).map((member) => ({ ...member })),
		total: filtered.length,
		adminCount: all.filter((member) => member.isAdmin).length
	};
}

/** 관리자 권한을 바꾼다. 자기 자신과 마지막 관리자는 바꿀 수 없다. */
export async function setMockAdmin(guildId: string, actorId: string, userId: string, isAdmin: boolean): Promise<MockFailure | null> {
	await wait();
	const all = members.get(guildId);
	const actor = all?.find((member) => member.userId === actorId);
	if (!all || !actor?.isAdmin) return { status: 403, message: '관리자만 바꿀 수 있어요' };
	const target = all.find((member) => member.userId === userId);
	if (!target) return { status: 404, message: '멤버를 찾을 수 없어요' };
	if (target.userId === actorId) return { status: 409, message: '자신의 권한은 바꿀 수 없어요' };
	if (!isAdmin && target.isAdmin && all.filter((member) => member.isAdmin).length === 1) return { status: 409, message: '마지막 관리자는 회수할 수 없어요' };
	target.isAdmin = isAdmin;
	return null;
}
