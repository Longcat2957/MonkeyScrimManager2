import type { MatchListItem } from '#lib/features/matches/types.ts';

// 진행 중·종료·중도 종료와 경기 시각 미확인, 긴 팀 이름을 한 번씩 포함한다.
const matches: (MatchListItem & { guildId: string })[] = [
	{
		guildId: 'devGuild001',
		id: 'devMatch001',
		scrimTitle: '금요일 칼바람 나락 내전 (초보 환영, 즐겜 위주)',
		teamA: '바나나 공장',
		teamB: '정글 차이',
		scoreA: 1,
		scoreB: 1,
		bestOf: 3,
		status: 'in_progress',
		playedAt: '2026-10-30T12:10:00Z'
	},
	{
		guildId: 'devGuild001',
		id: 'devMatch002',
		scrimTitle: '10월 3주차 정기 내전',
		teamA: '몽키 레드',
		teamB: '몽키 블루',
		scoreA: 2,
		scoreB: 0,
		bestOf: 3,
		status: 'completed',
		playedAt: '2026-10-24T11:20:00Z'
	},
	{
		guildId: 'devGuild001',
		id: 'devMatch003',
		scrimTitle: '10월 3주차 정기 내전',
		teamA: '홍길동과 아이들의 아주 긴 팀 이름',
		teamB: '미드 차이',
		scoreA: 1,
		scoreB: 2,
		bestOf: 3,
		status: 'completed',
		playedAt: '2026-10-24T13:05:00Z'
	},
	{
		guildId: 'devGuild001',
		id: 'devMatch004',
		scrimTitle: '10월 2주차 정기 내전',
		teamA: '1팀',
		teamB: '2팀',
		scoreA: 1,
		scoreB: 0,
		bestOf: 3,
		status: 'ended_early',
		playedAt: '2026-10-17T11:30:00Z'
	},
	{
		guildId: 'devGuild001',
		id: 'devMatch005',
		scrimTitle: '10월 2주차 정기 내전',
		teamA: '3팀',
		teamB: '4팀',
		scoreA: 3,
		scoreB: 2,
		bestOf: 5,
		status: 'completed',
		playedAt: null
	}
];

export async function listMockRecentMatches(guildId: string, { fail = false } = {}): Promise<MatchListItem[]> {
	if (fail) throw new Error('목 데이터: 최근 경기 조회 실패 재현');
	return matches.filter((match) => match.guildId === guildId).map(({ guildId: _, ...match }) => match);
}
