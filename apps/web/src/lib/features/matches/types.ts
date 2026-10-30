import type { matchStatus } from '#lib/server/db/schema.ts';

export type MatchStatus = (typeof matchStatus.enumValues)[number];

// 서버 홈·경기 기록의 한 행이다. 점수는 결과가 기록된 게임만 센다.
export type MatchListItem = {
	id: string;
	scrimTitle: string;
	teamA: string;
	teamB: string;
	scoreA: number;
	scoreB: number;
	bestOf: number;
	status: MatchStatus;
	// 실제 경기 시각을 확인하지 못했으면 null이다. 업로드 시각으로 대신하지 않는다.
	playedAt: string | null;
};
