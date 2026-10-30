import type { lolPosition } from '#lib/server/db/schema.ts';
import type { ScrimListItem } from '#lib/features/scrims/types.ts';

export type SessionUser = {
	userId: string;
	displayName: string;
	avatarUrl: string | null;
	isServiceAdmin: boolean;
};

export type GuildSummary = {
	id: string;
	name: string;
};

// 서버 하위 레이아웃이 접근 확인 후 내려주는 현재 서버 문맥이다.
export type GuildContext = GuildSummary & {
	isAdmin: boolean;
};

export type LolPosition = (typeof lolPosition.enumValues)[number];

// 서버 홈 맨 위 카드에 보여 줄 내전. mine은 내가 신청·선발·대기 중인 내전, open은 지금 신청할 수 있는 모집이다.
export type NextScrim = {
	kind: 'mine' | 'open';
	scrim: ScrimListItem;
	hardFearless: boolean;
	// 배경으로 쓸 챔피언 스플래시 아트. 없으면 배경색만 쓴다.
	artUrl: string | null;
};

export type RankingEntry = {
	rank: number;
	userId: string;
	displayName: string;
	mmr: number;
	games: number;
	wins: number;
	// 해당 포지션에서 가장 많이 쓴 챔피언 아이콘. 없으면 이름 첫 글자로 대신한다.
	iconUrl: string | null;
	isMe: boolean;
};

// 현재 시즌 순위의 한 쪽(page)이다. me는 내 기록이 있으면 순위와 관계없이 들어간다.
export type RankingPage = {
	entries: RankingEntry[];
	hasMore: boolean;
	me: RankingEntry | null;
};

// 서버 홈은 포지션마다 첫 쪽만 받고, 나머지는 스크롤할 때 /g/[guildId]/ranking에서 이어 받는다.
export type GuildRanking = {
	seasonName: string;
	positions: Record<LolPosition, RankingPage>;
};

// 서버 홈 스토리 카드. 연승·연패·기록처럼 최근 경기에서 뽑은 이야기다.
export type GuildStory = {
	id: string;
	kind: 'win_streak' | 'loss_streak' | 'most_kills' | 'first_win' | 'comeback';
	userId: string;
	displayName: string;
	headline: string;
	detail: string;
	artUrl: string | null;
};
