import type {
	GameDetail,
	GameParticipantLine,
	GameSide,
	GameStatus,
	MatchSummary,
	PlayerRef,
	Position
} from '#lib/data/types.ts';
import { POSITIONS } from '#lib/data/types.ts';
import { USERS } from './guilds.ts';
import { between, unit } from './random.ts';
import { MATCHES } from './records.ts';
import { findScrim } from './scrims.ts';

/*
 * 경기(Game) 단위 목 기록.
 * 실제 ROFL 결과를 대신하지 않으며, 팀·진영·승패·성적의 표시 형태만 재현한다.
 */

const CHAMPIONS_BY_POSITION: Record<Position, string[]> = {
	top: ['아트록스', '잭스', '그웬', '케넨', '세트'],
	jungle: ['리 신', '바이', '세주아니', '케인', '니달리'],
	mid: ['아리', '오리아나', '아지르', '빅토르', '사일러스'],
	bot: ['카이사', '진', '루시안', '이즈리얼', '제리'],
	support: ['룰루', '노틸러스', '레오나', '쓰레쉬', '라칸']
};

function toPlayerRef(userIndex: number): PlayerRef {
	const user = USERS[userIndex % USERS.length];
	return { userId: user.id, displayName: user.displayName, riotId: user.riotId };
}

/** 시리즈에서 실제로 출전한 참가자 명단. 선발 인원이 부족하면 사용자 목록으로 채운다. */
function participantPool(match: MatchSummary): PlayerRef[] {
	const scrim = findScrim(match.scrimId);
	const selected = scrim?.registrations.filter((registration) => registration.status === 'selected') ?? [];
	if (selected.length >= 10) {
		return selected.map((registration) => registration.player);
	}
	return USERS.map((_, index) => toPlayerRef(index));
}

function buildLine(
	match: MatchSummary,
	gameNumber: number,
	side: GameSide,
	positionIndex: number,
	player: PlayerRef,
	champion: string
): GameParticipantLine {
	const position = POSITIONS[positionIndex];
	const seed = `${match.id}:${gameNumber}:${side}:${position}`;

	return {
		participantId: `${seed}:${player.userId ?? 'unknown'}`,
		player,
		champion,
		position,
		side,
		kills: between(`${seed}:k`, 0, 12),
		deaths: between(`${seed}:d`, 0, 9),
		assists: between(`${seed}:a`, 0, 18),
		cs: between(`${seed}:cs`, 120, 320),
		gold: between(`${seed}:gold`, 8000, 18000),
		vision: between(`${seed}:vision`, 8, 45)
	};
}

/** 한 경기에서 두 팀이 같은 챔피언을 쓰지 않도록 포지션별로 서로 다른 값을 고른다. */
function championsForGame(matchId: string, gameNumber: number): Record<Position, [string, string]> {
	return Object.fromEntries(
		POSITIONS.map((position) => {
			const list = CHAMPIONS_BY_POSITION[position];
			const base = Math.floor(unit(`${matchId}:${gameNumber}:${position}:pick`) * list.length);
			const offset = 1 + Math.floor(unit(`${matchId}:${gameNumber}:${position}:red`) * (list.length - 1));
			return [position, [list[base % list.length], list[(base + offset) % list.length]]];
		})
	) as Record<Position, [string, string]>;
}

function gameStatus(match: MatchSummary, gameNumber: number, completedGames: number): GameStatus {
	if (match.status === 'cancelled') return 'cancelled';
	if (match.status === 'pending') return 'pending';
	if (gameNumber <= completedGames) return 'completed';
	return 'in_progress';
}

/** 한 시리즈의 Game 목록. 완료 점수로 승패를 정하고, 남은 한 경기는 진행 중으로 둔다. */
function buildGames(match: MatchSummary): GameDetail[] {
	if (match.status === 'cancelled') {
		return [];
	}

	const [scoreA, scoreB] = match.score;
	const completedGames = match.status === 'pending' ? 0 : scoreA + scoreB;
	const totalGames =
		match.status === 'completed' || match.status === 'ended_early'
			? Math.max(1, completedGames)
			: completedGames + 1;
	const pool = participantPool(match);

	return Array.from({ length: totalGames }, (_, index) => {
		const number = index + 1;
		// 진영은 매 경기 바뀐다. Match의 A/B와 Game의 블루/레드는 다른 값이다.
		const blueIsTeamA = number % 2 === 1;
		const blueTeam = blueIsTeamA ? match.teamA : match.teamB;
		const redTeam = blueIsTeamA ? match.teamB : match.teamA;

		const winnerTeam = number <= scoreA ? match.teamA : number <= scoreA + scoreB ? match.teamB : null;
		const winnerSide: GameSide | null = winnerTeam
			? winnerTeam.id === blueTeam.id
				? 'blue'
				: 'red'
			: null;

		// 경기마다 선발 인원이 순환하도록 시작 위치를 옮긴다. 모든 경기에 10명이 채워진다.
		const start = (index * 5) % pool.length;
		const bluePlayers = Array.from({ length: 5 }, (_, slot) => pool[(start + slot) % pool.length]);
		const redPlayers = Array.from({ length: 5 }, (_, slot) => pool[(start + 5 + slot) % pool.length]);
		const champions = championsForGame(match.id, number);

		return {
			id: `${match.id}-g${number}`,
			number,
			status: gameStatus(match, number, completedGames),
			blueTeam,
			redTeam,
			winnerSide,
			durationMs: winnerSide ? between(`${match.id}:${number}:duration`, 1_500_000, 2_400_000) : null,
			participants: [
				...bluePlayers.map((player, positionIndex) =>
					buildLine(match, number, 'blue', positionIndex, player, champions[POSITIONS[positionIndex]][0])
				),
				...redPlayers.map((player, positionIndex) =>
					buildLine(match, number, 'red', positionIndex, player, champions[POSITIONS[positionIndex]][1])
				)
			]
		};
	});
}

export const GAMES: Record<string, GameDetail[]> = Object.fromEntries(
	MATCHES.map((match) => [match.id, buildGames(match)])
);

export function findGames(matchId: string): GameDetail[] {
	return GAMES[matchId] ?? [];
}
