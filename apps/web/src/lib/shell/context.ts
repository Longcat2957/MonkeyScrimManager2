import type { FormationMethod, ScrimStatus } from '#lib/data/types.ts';

/*
 * 셸(헤더·레일·제목)이 쓰는 최소 문맥.
 * 값은 레이아웃의 load가 접근 권한과 존재 여부를 확인한 뒤에만 전달한다.
 */

export interface GuildOption {
	id: string;
	name: string;
	iconUrl: string | null;
}

/** 서버 헤더와 서버 문서 제목이 쓰는 문맥. */
export interface GuildContext extends GuildOption {
	viewerRole: 'guest' | 'member' | 'admin';
}

/** 내전 헤더와 내전 문서 제목이 쓰는 문맥. */
export interface ScrimContext {
	id: string;
	guildId: string;
	title: string;
	status: ScrimStatus;
	formationMethod: FormationMethod | null;
	teamCount: number;
	expectedStartAt: string | null;
}

/** 로그인 사용자. 인증 구현 전에는 null이며 헤더가 계정 영역을 그리지 않는다. */
export interface ViewerContext {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	isServiceAdmin: boolean;
	guilds: GuildOption[];
}
