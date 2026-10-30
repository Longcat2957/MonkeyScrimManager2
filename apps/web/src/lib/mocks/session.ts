import type { GuildContext, GuildSummary, SessionUser } from '#lib/features/guild/types.ts';

// 인증이 연결되기 전 개발 모드에서만 사용하는 로그인 사용자와 접근 가능한 서버다.
export const mockUser: SessionUser = {
	userId: 'devUser001',
	displayName: '개발자',
	avatarUrl: null,
	isServiceAdmin: true
};

const guilds: GuildContext[] = [
	{ id: 'devGuild001', name: '원숭이 내전 서버', isAdmin: true },
	{ id: 'devGuild002', name: '목요 칼바람 모임', isAdmin: false }
];

export const mockGuilds: GuildSummary[] = guilds.map(({ id, name }) => ({ id, name }));

export function findMockGuild(guildId: string) {
	return guilds.find((guild) => guild.id === guildId) ?? null;
}

// 서버 홈 배경 아트에 쓸 로그인 사용자의 주 챔피언(Data Dragon ID).
export const mockMainChampion = 'Ahri';
