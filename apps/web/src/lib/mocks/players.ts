import type {
	GuildAdminView,
	GuildStatsView,
	PlayerProfile,
	PlayerRecentGame,
	PlayerRef,
	Position
} from '#lib/data/types.ts';
import { POSITIONS } from '#lib/data/types.ts';
import { GUILDS, USERS, findGuild } from './guilds.ts';
import { GAMES } from './games.ts';
import { between } from './random.ts';
import { MATCHES } from './records.ts';
import { SCRIMS } from './scrims.ts';

/*
 * 사용자 전적·서버 통계·서버 관리 목 값.
 * 모두 내전·시리즈·Game 표본에서 계산해 서로 모순되지 않게 한다.
 */

function guildScrimIds(guildId: string): Set<string> {
	return new Set(SCRIMS.filter((scrim) => scrim.guildId === guildId).map((scrim) => scrim.id));
}

export function findPlayer(userId: string): PlayerRef | null {
	const user = USERS.find((candidate) => candidate.id === userId);
	if (user) return { userId: user.id, displayName: user.displayName, riotId: user.riotId };

	// 과거 참가 기록에만 남아 있는 사용자도 이름은 그대로 보여 준다.
	for (const scrim of SCRIMS) {
		const registration = scrim.registrations.find((item) => item.player.userId === userId);
		if (registration) return registration.player;
	}
	return null;
}

/** 해당 서버의 Game을 사용자 기준으로 훑어 전적을 만든다. */
export function buildPlayerProfile(
	guildId: string,
	userId: string,
	page: number,
	pageSize: number
): PlayerProfile | null {
	const player = findPlayer(userId);
	if (!player) return null;

	const scrimIds = guildScrimIds(guildId);
	const matches = MATCHES.filter((match) => scrimIds.has(match.scrimId));
	const recent: PlayerRecentGame[] = [];

	let wins = 0;
	let losses = 0;

	for (const match of matches) {
		for (const game of GAMES[match.id] ?? []) {
			const line = game.participants.find((participant) => participant.player.userId === userId);
			if (!line) continue;

			const result = game.winnerSide === null ? 'unknown' : game.winnerSide === line.side ? 'win' : 'loss';
			if (result === 'win') wins += 1;
			if (result === 'loss') losses += 1;

			const opponent = line.side === 'blue' ? game.redTeam.name : game.blueTeam.name;
			recent.push({
				matchId: match.id,
				gameId: game.id,
				gameNumber: game.number,
				opponent,
				champion: line.champion,
				result,
				playedAt: match.playedAt
			});
		}
	}

	recent.sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? '') || b.gameNumber - a.gameNumber);

	const games = wins + losses;
	const start = (page - 1) * pageSize;

	// 공개 범위가 MMR을 숨기면 null이며, 화면은 영역 자체를 그리지 않는다.
	const positionMmr = POSITIONS.map((position) => ({
		position,
		value: between(`${userId}:${position}:mmr`, 1320, 1840),
		status: 'applied' as const
	}));

	return {
		player,
		totals: { games, wins, losses },
		winRate: games > 0 ? (wins / games) * 100 : null,
		mmrSeason: '2026 시즌 2',
		positionMmr,
		recent: recent.slice(start, start + pageSize),
		total: recent.length
	};
}

export function buildGuildStats(guildId: string): GuildStatsView {
	const scrimIds = guildScrimIds(guildId);
	const matches = MATCHES.filter((match) => scrimIds.has(match.scrimId));
	const players = new Set<string>();
	let games = 0;
	let durationSum = 0;
	let durationCount = 0;

	const byPosition = new Map<Position, { kills: number; deaths: number; assists: number; cs: number; games: number }>();

	for (const match of matches) {
		for (const game of GAMES[match.id] ?? []) {
			if (game.status !== 'completed') continue;
			games += 1;
			if (game.durationMs !== null) {
				durationSum += game.durationMs;
				durationCount += 1;
			}
			for (const line of game.participants) {
				if (line.player.userId) players.add(line.player.userId);
				const current = byPosition.get(line.position) ?? { kills: 0, deaths: 0, assists: 0, cs: 0, games: 0 };
				current.kills += line.kills;
				current.deaths += line.deaths;
				current.assists += line.assists;
				current.cs += line.cs;
				current.games += 1;
				byPosition.set(line.position, current);
			}
		}
	}

	return {
		games,
		players: players.size,
		averageDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
		positions: POSITIONS.map((position) => {
			const current = byPosition.get(position);
			if (!current || current.games === 0) return { position, games: 0, kda: 0, cs: 0 };
			return {
				position,
				games: current.games,
				kda: (current.kills + current.assists) / Math.max(1, current.deaths),
				cs: current.cs / current.games
			};
		})
	};
}

// 서버 설정·권한 변경의 목 저장소. 같은 세션에서 저장 결과가 다시 보이도록 보관한다.
const guildSettings = new Map<string, { recruitChannel: string | null; resultChannel: string | null }>();
const memberRoles = new Map<string, 'member' | 'admin'>();

export function updateGuildSettings(
	guildId: string,
	next: { recruitChannel: string | null; resultChannel: string | null }
): boolean {
	if (!findGuild(guildId)) return false;
	guildSettings.set(guildId, next);
	return true;
}

export function updateMemberRole(guildId: string, userId: string, role: 'member' | 'admin'): boolean {
	if (!findGuild(guildId)) return false;
	memberRoles.set(`${guildId}:${userId}`, role);
	return true;
}

export function buildGuildAdmin(guildId: string): GuildAdminView | null {
	const guild = findGuild(guildId);
	if (!guild) return null;

	const members = USERS.slice(0, Math.min(18, guild.memberCount)).map((user, index) => {
		const defaultRole = index === 0 && guild.viewerRole === 'admin' ? ('admin' as const) : ('member' as const);
		return {
			player: { userId: user.id, displayName: user.displayName, riotId: user.riotId },
			role: memberRoles.get(`${guildId}:${user.id}`) ?? defaultRole,
			joinedAt: `2026-0${(index % 9) + 1}-1${index % 9}T12:00:00+09:00`
		};
	});

	return {
		members,
		settings: guildSettings.get(guildId) ?? {
			recruitChannel: indexOf(guildId) === 0 ? '#내전-모집' : null,
			resultChannel: null
		},
		capabilities: { canEdit: guild.viewerRole === 'admin', canChangeRoles: guild.viewerRole === 'admin' }
	};
}

function indexOf(guildId: string): number {
	return GUILDS.findIndex((guild) => guild.id === guildId);
}
