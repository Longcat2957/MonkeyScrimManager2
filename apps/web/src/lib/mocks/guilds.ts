import type { GuildOption } from '#lib/shell/context.ts';

/*
 * 개발용 목 사용자·서버.
 * 실존 인물이나 실제 Discord 서버를 흉내 내지 않는다. 값은 고정이며 무작위로 바뀌지 않는다.
 */

export const DEMO_VIEWER_ID = 'user-demo';

export interface MockGuild extends GuildOption {
	viewerRole: 'guest' | 'member' | 'admin';
	memberCount: number;
}

export const GUILDS: MockGuild[] = [
	{
		id: 'monkey-dorm',
		name: '몽키 숙소',
		iconUrl: null,
		viewerRole: 'admin',
		memberCount: 34
	},
	{
		id: 'evening-club',
		name: '저녁 내전 클럽',
		iconUrl: null,
		viewerRole: 'member',
		memberCount: 21
	},
	{
		id: 'weekend-scrim',
		name: '주말 스크림',
		iconUrl: null,
		viewerRole: 'member',
		memberCount: 12
	}
];

/** 목 사용자 24명. 본인(모의 사용자)이 첫 번째다. */
export interface MockUser {
	id: string;
	displayName: string;
	riotId: string | null;
}

export const USERS: MockUser[] = Array.from({ length: 24 }, (_, index) => {
	const number = String(index + 1).padStart(2, '0');
	const isViewer = index === 0;
	return {
		id: isViewer ? DEMO_VIEWER_ID : `user-${number}`,
		displayName: isViewer ? '모의 사용자' : `참가자 ${number}`,
		// 일부 참가자는 Riot 계정 연결이 없는 상태를 재현한다.
		riotId: index % 7 === 5 ? null : `참가자${number}#KR1`
	};
});

export const VIEWER = USERS[0];

export function findGuild(guildId: string): MockGuild | undefined {
	return GUILDS.find((guild) => guild.id === guildId);
}
