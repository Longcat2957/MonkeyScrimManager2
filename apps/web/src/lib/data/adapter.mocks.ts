import { dev } from '$app/env';
import type {
	Loadable,
	MatchListFilter,
	MatchSummary,
	NewScrimInput,
	PageResult,
	ScrimListFilter,
	ScrimSummary
} from '#lib/data/types.ts';
import type { GuildContext, ViewerContext } from '#lib/shell/context.ts';
import { GUILDS, USERS, VIEWER, findGuild } from '#lib/mocks/guilds.ts';
import { MATCHES } from '#lib/mocks/records.ts';
import { SCRIMS, addScrim, toSummary } from '#lib/mocks/scrims.ts';
import { pause, type Scenario } from '#lib/mocks/simulate.ts';

/*
 * 목 구현.
 * 실제 서비스 레이어가 생기면 `data/index.ts`의 어댑터만 교체하고 라우트·컴포넌트는 그대로 둔다.
 */

function ready<T>(data: T): Loadable<T> {
	return { status: 'ready', data };
}

function failure<T>(message: string): Loadable<T> {
	return { status: 'error', message };
}

/** 로그인 사용자. 인증 구현 전에는 개발 모드에서만 목 사용자를 돌려준다. */
export async function getViewer(): Promise<ViewerContext | null> {
	if (!dev) return null;

	return {
		id: VIEWER.id,
		displayName: VIEWER.displayName,
		avatarUrl: null,
		isServiceAdmin: false,
		guilds: GUILDS.map(({ id, name, iconUrl }) => ({ id, name, iconUrl }))
	};
}

export async function getGuildContext(
	guildId: string,
	viewer: ViewerContext | null
): Promise<GuildContext | 'missing' | 'forbidden'> {
	const guild = findGuild(guildId);
	if (!guild) return 'missing';
	// 로그인 전에는 목 서버를 공개 열람으로 취급한다.
	if (viewer && !viewer.guilds.some((option) => option.id === guildId)) return 'forbidden';
	return { id: guild.id, name: guild.name, iconUrl: guild.iconUrl, viewerRole: guild.viewerRole };
}

/** 서버 홈: 진행 중 내전·최근 경기·서버 요약을 각각 독립 결과로 돌려준다. */
export async function getGuildHome(guildId: string, scenario: Scenario = 'normal') {
	await pause(scenario);

	const activeScrims = SCRIMS.filter(
		(scrim) => scrim.guildId === guildId && ['recruit', 'preparing', 'ready', 'in_progress'].includes(scrim.status)
	).map(toSummary);
	const recentMatches = MATCHES.filter((match) => {
		const scrim = SCRIMS.find((item) => item.id === match.scrimId);
		return scrim?.guildId === guildId && match.status !== 'pending';
	}).slice(0, 4);

	const scrimIds = new Set(SCRIMS.filter((scrim) => scrim.guildId === guildId).map((scrim) => scrim.id));
	const completed = MATCHES.filter(
		(match) => scrimIds.has(match.scrimId) && match.status === 'completed'
	);

	return {
		// 빈 시나리오는 두 목록을 비우고, 부분 실패는 한 영역만 실패시킨다.
		activeScrims:
			scenario === 'error'
				? failure<ScrimSummary[]>('진행 중 내전을 불러오지 못했어요.')
				: ready<ScrimSummary[]>(scenario === 'empty' ? [] : activeScrims),
		recentMatches:
			scenario === 'error' || scenario === 'partial'
				? failure<MatchSummary[]>('최근 경기를 불러오지 못했어요.')
				: ready<MatchSummary[]>(scenario === 'empty' ? [] : recentMatches),
		summary: ready({
			completedGames: completed.reduce((sum, match) => sum + match.score[0] + match.score[1], 0),
			players: new Set(USERS.map((user) => user.id)).size,
			averageDurationMs: completed.length > 0 ? 1_884_000 : null
		})
	};
}

export async function listScrims(
	guildId: string,
	filter: ScrimListFilter,
	scenario: Scenario = 'normal'
): Promise<PageResult<ScrimSummary>> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('내전 목록을 불러오지 못했습니다.');

	const all = SCRIMS.filter((scrim) => scrim.guildId === guildId)
		.filter((scrim) => filter.status === 'all' || scrim.status === filter.status)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.map(toSummary);

	if (scenario === 'empty') return { items: [], total: 0 };

	const start = (filter.page - 1) * filter.pageSize;
	return { items: all.slice(start, start + filter.pageSize), total: all.length };
}

export async function listMatches(
	guildId: string,
	filter: MatchListFilter,
	scenario: Scenario = 'normal'
): Promise<PageResult<MatchSummary>> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('경기 기록을 불러오지 못했습니다.');

	const scrimIds = new Set(SCRIMS.filter((scrim) => scrim.guildId === guildId).map((scrim) => scrim.id));
	const query = filter.q.trim().toLowerCase();
	const all = MATCHES.filter((match) => scrimIds.has(match.scrimId))
		.filter((match) => filter.status === 'all' || match.status === filter.status)
		.filter((match) =>
			query.length === 0
				? true
				: [match.scrimTitle, match.teamA.name, match.teamB.name].some((value) =>
						value.toLowerCase().includes(query)
					)
		)
		.sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? ''));

	if (scenario === 'empty') return { items: [], total: 0 };

	const start = (filter.page - 1) * filter.pageSize;
	return { items: all.slice(start, start + filter.pageSize), total: all.length };
}

/** 모집 생성. 같은 내전을 중복 생성하지 않도록 제목을 그대로 새 항목으로만 추가한다. */
export async function createScrim(guildId: string, input: NewScrimInput): Promise<ScrimSummary> {
	return toSummary(addScrim(guildId, input));
}
