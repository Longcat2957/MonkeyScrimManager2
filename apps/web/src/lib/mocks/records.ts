import type { MatchStatus, MatchSummary } from '#lib/data/types.ts';
import { findScrim } from './scrims.ts';

/*
 * 개발용 시리즈(경기) 표본.
 * 내전과 같은 팀 이름을 쓰고, 완료·중도 종료·진행 중인 경우를 함께 둔다.
 */

interface MatchSeed {
	id: string;
	scrimId: string;
	teamA: string;
	teamB: string;
	bestOf: number;
	score: [number, number];
	status: MatchStatus;
	playedAt: string | null;
}

const SEEDS: MatchSeed[] = [
	{
		id: 'match-1003-1',
		scrimId: 'scrim-1003',
		teamA: '팀 A',
		teamB: '팀 B',
		bestOf: 3,
		score: [1, 1],
		status: 'in_progress',
		playedAt: '2026-10-29T20:10:00+09:00'
	},
	{
		id: 'match-1003-2',
		scrimId: 'scrim-1003',
		teamA: '팀 C',
		teamB: '팀 D',
		bestOf: 3,
		score: [1, 0],
		status: 'in_progress',
		playedAt: '2026-10-29T20:15:00+09:00'
	},
	{
		id: 'match-1004-1',
		scrimId: 'scrim-1004',
		teamA: '1팀',
		teamB: '2팀',
		bestOf: 5,
		score: [3, 1],
		status: 'completed',
		playedAt: '2026-10-28T20:40:00+09:00'
	},
	{
		id: 'match-1005-1',
		scrimId: 'scrim-1005',
		teamA: '1팀',
		teamB: '2팀',
		bestOf: 3,
		score: [1, 0],
		status: 'ended_early',
		playedAt: '2026-10-27T21:10:00+09:00'
	},
	{
		id: 'match-2002-1',
		scrimId: 'scrim-2002',
		teamA: '1팀',
		teamB: '2팀',
		bestOf: 3,
		score: [2, 0],
		status: 'completed',
		playedAt: '2026-10-28T21:05:00+09:00'
	},
	{
		id: 'match-2002-2',
		scrimId: 'scrim-2002',
		teamA: '3팀',
		teamB: '4팀',
		bestOf: 3,
		// 결과가 아직 없는 시리즈를 0:0으로 위장하지 않는다.
		score: [0, 0],
		status: 'cancelled',
		playedAt: null
	}
];

function toMatchSummary(seed: MatchSeed): MatchSummary {
	const scrim = findScrim(seed.scrimId);
	return {
		id: seed.id,
		scrimId: seed.scrimId,
		scrimTitle: scrim?.title ?? '알 수 없는 내전',
		teamA: { id: `${seed.id}-a`, name: seed.teamA },
		teamB: { id: `${seed.id}-b`, name: seed.teamB },
		bestOf: seed.bestOf,
		score: seed.score,
		status: seed.status,
		playedAt: seed.playedAt
	};
}

export const MATCHES: MatchSummary[] = SEEDS.map(toMatchSummary);
