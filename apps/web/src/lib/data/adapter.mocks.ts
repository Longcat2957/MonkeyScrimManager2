import { dev } from '$app/env';
import type {
	PrivacySettingsView,
	RiotAccountView,
	ViewerProfile,
	GuildAdminView,
	GuildStatsView,
	Loadable,
	MatchDetail,
	MatchListFilter,
	MatchSummary,
	NewScrimInput,
	PageResult,
	PlayerProfile,
	Position,
	ScrimDetail,
	ScrimListFilter,
	ScrimSummary
} from '#lib/data/types.ts';
import type { GuildContext, ViewerContext } from '#lib/shell/context.ts';
import { GUILDS, VIEWER, findGuild } from '#lib/mocks/guilds.ts';
import { addAccount, getPrivacy, listAccounts, removeAccount, updatePrivacy } from '#lib/mocks/account.ts';
import { findGames } from '#lib/mocks/games.ts';
import type { ScrimContext } from '#lib/shell/context.ts';
import {
	buildGuildAdmin,
	buildGuildStats,
	buildPlayerProfile,
	updateGuildSettings,
	updateMemberRole
} from '#lib/mocks/players.ts';
import { MATCHES } from '#lib/mocks/records.ts';
import {
	SCRIMS,
	addScrim,
	findScrim,
	registerParticipant,
	setRegistrationStatus as setRegistrationStatusStore,
	setScrimStatus,
	toSummary,
	withdrawRegistration as withdrawRegistrationStore
} from '#lib/mocks/scrims.ts';
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

	// 서버 홈은 "지금 진행 중인 운영"만 담당한다. 통계·전체 기록은 각 화면이 맡는다.
	const activeScrims = SCRIMS.filter(
		(scrim) => scrim.guildId === guildId && ['recruit', 'preparing', 'ready', 'in_progress'].includes(scrim.status)
	).map(toSummary);

	return {
		activeScrims:
			scenario === 'error'
				? failure<ScrimSummary[]>('진행 중 내전을 불러오지 못했어요.')
				: ready<ScrimSummary[]>(scenario === 'empty' ? [] : activeScrims)
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
		.sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? ''))
		.map((match) => ({ ...match }));

	if (scenario === 'empty') return { items: [], total: 0 };

	const start = (filter.page - 1) * filter.pageSize;
	return { items: all.slice(start, start + filter.pageSize), total: all.length };
}

/** 모집 생성. 같은 내전을 중복 생성하지 않도록 제목을 그대로 새 항목으로만 추가한다. */
export async function createScrim(guildId: string, input: NewScrimInput): Promise<ScrimSummary> {
	return toSummary(addScrim(guildId, input));
}

/** 내전 요약. 신청 가능 여부와 운영 권한은 서버가 판단한 값만 전달한다. */
export async function getScrimDetail(
	guildId: string,
	scrimId: string,
	viewer: ViewerContext | null,
	canManage: boolean,
	scenario: Scenario = 'normal'
): Promise<ScrimDetail | 'missing'> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('내전을 불러오지 못했습니다.');

	const scrim = findScrim(scrimId);
	if (!scrim || scrim.guildId !== guildId) return 'missing';

	// 화면 상태가 저장소의 배열을 직접 참조하지 않도록 복사해서 넘긴다.
	const registrations = scrim.registrations.map((registration) => ({ ...registration }));
	const viewerRegistration =
		registrations.find((registration) => registration.player.userId === viewer?.id) ?? null;
	const isFull = scrim.applicantCount >= scrim.appliedCapacity;

	const registerBlockedReason =
		scrim.status !== 'recruit'
			? '모집이 마감되었습니다.'
			: isFull
				? '신청 정원이 찼습니다.'
				: null;

	return {
		...toSummary(scrim),
		createdAt: scrim.createdAt,
		registrations,
		viewerRegistration,
		capabilities: {
			canManage,
			canRegister: Boolean(viewer) && !viewerRegistration && registerBlockedReason === null,
			registerBlockedReason
		}
	};
}

/** 본인 신청. 같은 내전에 이미 신청이 있으면 추가하지 않는다. */
export async function registerSelf(
	scrimId: string,
	viewer: ViewerContext,
	positions: Position[]
): Promise<boolean> {
	return (
		registerParticipant(
			scrimId,
			{ userId: viewer.id, displayName: viewer.displayName, riotId: null },
			positions
		) !== null
	);
}

export async function withdrawRegistration(scrimId: string, participantId: string): Promise<boolean> {
	return withdrawRegistrationStore(scrimId, participantId);
}

export async function setRegistrationStatus(
	scrimId: string,
	participantId: string,
	status: 'selected' | 'standby' | 'excluded'
): Promise<boolean> {
	return setRegistrationStatusStore(scrimId, participantId, status);
}

/** 시리즈·Game 상세. */
export async function getMatchDetail(
	guildId: string,
	matchId: string,
	canUploadRofl: boolean,
	scenario: Scenario = 'normal'
): Promise<MatchDetail | 'missing'> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('경기 기록을 불러오지 못했습니다.');

	const match = MATCHES.find((candidate) => candidate.id === matchId);
	if (!match) return 'missing';
	const scrim = findScrim(match.scrimId);
	if (!scrim || scrim.guildId !== guildId) return 'missing';

	const games =
		scenario === 'empty'
			? []
			: findGames(match.id).map((game) => ({
					...game,
					participants: game.participants.map((line) => ({ ...line }))
				}));

	return {
		...match,
		games,
		isHardFearless: scrim.isHardFearless,
		capabilities: { canUploadRofl }
	};
}

export async function getPlayerProfile(
	guildId: string,
	userId: string,
	page: number,
	pageSize: number,
	scenario: Scenario = 'normal'
): Promise<PlayerProfile | 'missing'> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('전적을 불러오지 못했습니다.');

	const profile = buildPlayerProfile(guildId, userId, page, pageSize);
	return profile ?? 'missing';
}

export async function getGuildStats(guildId: string, scenario: Scenario = 'normal'): Promise<GuildStatsView> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('통계를 불러오지 못했습니다.');
	return buildGuildStats(guildId);
}

export async function getGuildAdmin(guildId: string, scenario: Scenario = 'normal'): Promise<GuildAdminView | 'missing'> {
	await pause(scenario);
	if (scenario === 'error') throw new Error('관리 정보를 불러오지 못했습니다.');
	const admin = buildGuildAdmin(guildId);
	return admin ?? 'missing';
}


/** 헤더·제목이 쓰는 내전 문맥. 존재 여부만 확인한다. */
export async function getScrimContext(guildId: string, scrimId: string): Promise<ScrimContext | 'missing'> {
	const scrim = findScrim(scrimId);
	if (!scrim || scrim.guildId !== guildId) return 'missing';
	return {
		id: scrim.id,
		guildId: scrim.guildId,
		title: scrim.title,
		status: scrim.status,
		formationMethod: scrim.formationMethod,
		teamCount: scrim.teamCount,
		expectedStartAt: scrim.expectedStartAt
	};
}

/** 모집 마감. 편성 방식이 정해져 있어야 한다. */
export async function closeRecruitment(scrimId: string): Promise<boolean> {
	return setScrimStatus(scrimId, 'preparing');
}


/** 본인 계정 연결·공개 범위. 로그인 사용자 문맥을 확인한 뒤 호출한다. */
export async function getViewerProfile(): Promise<ViewerProfile> {
	return { accounts: listAccounts(), privacy: getPrivacy() };
}

/** Riot ID 조회 결과를 연결한다. 소유권 확인은 아직 별도 단계가 없다. */
export async function linkRiotAccount(gameName: string, tagLine: string): Promise<RiotAccountView | null> {
	return addAccount(gameName, tagLine);
}

export async function unlinkRiotAccount(accountId: string): Promise<boolean> {
	return removeAccount(accountId);
}

export async function savePrivacy(next: PrivacySettingsView): Promise<PrivacySettingsView> {
	return updatePrivacy(next);
}


export async function saveGuildSettings(
	guildId: string,
	next: { recruitChannel: string | null; resultChannel: string | null }
): Promise<boolean> {
	return updateGuildSettings(guildId, next);
}

export async function setMemberRole(
	guildId: string,
	userId: string,
	role: 'member' | 'admin'
): Promise<boolean> {
	return updateMemberRole(guildId, userId, role);
}
