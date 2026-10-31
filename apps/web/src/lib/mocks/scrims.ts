import type { LolPosition } from '#lib/features/guild/types.ts';
import { playCapacity } from '#lib/features/scrims/settings.ts';
import type {
	MyRegistration,
	RegistrationStatus,
	ScrimContext,
	ScrimListItem,
	ScrimMember,
	ScrimNextAction,
	ScrimParticipant,
	ScrimRegistrationCounts,
	ScrimSettings,
	ScrimStatus,
	ScrimStatusFilter
} from '#lib/features/scrims/types.ts';
import { mockMainChampion, mockUser } from './session.ts';

// 개발 서버가 살아 있는 동안 유지되는 내전 목 저장소다. 실제 DB 연결 전까지 사용한다.

const LATENCY_MS = 400;
const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

export type MockFailure = { status: number; message: string };

// 챔피언 ID를 아이콘 URL로 바꾸는 함수다. Data Dragon 버전은 라우트의 load가 알고 있으므로 넘겨받는다.
export type IconResolver = (championId: string) => string | null;
const noIcon: IconResolver = () => null;

// mmr은 현재 시즌의 포지션별 값이다(초기값 1500). 팀 편성·경매 화면이 사용한다.
export type MockParticipant = Omit<ScrimParticipant, 'iconUrl'> & {
	riotAccountId: string;
	championId: string;
	mmr: Record<LolPosition, number>;
};

export type MockScrim = ScrimSettings & {
	guildId: string;
	id: string;
	status: ScrimStatus;
	canManage: boolean;
	createdAt: string;
	participants: MockParticipant[];
};

const NAMES = [
	'홍길동', '김철수', '박영희', '이몽룡', '성춘향', '장보고', '강감찬', '유관순', '안중근', '정약용',
	'세종', '이순신', '최무선', '허준', '김유신', '을지문덕', '신사임당', '황진이', '계백', '온달'
];
const CHAMPIONS = ['Garen', 'LeeSin', 'Thresh', 'Jinx', 'Darius', 'Yasuo', 'Nautilus', 'Ezreal', 'Lux', 'Khazix', 'Leona', 'Kaisa', 'Camille', 'Viego', 'Lulu', 'Caitlyn', 'Sett', 'Graves', 'Nami', 'Orianna'];
const POSITION_SETS: LolPosition[][] = [['mid', 'top'], ['jungle'], ['support'], ['bot'], ['top'], ['mid'], ['jungle', 'support'], ['bot', 'mid']];

// 목록 행·요약에서 상태 표현을 확인할 수 있도록 참가자 상태를 순서대로 배정한다.
function participants(scrimId: string, statuses: RegistrationStatus[]): MockParticipant[] {
	return statuses.map((status, index) => ({
		registrationId: `${scrimId}-r${index + 1}`,
		// 마지막 참가자는 사용자 연결이 사라진 과거 기록을 재현한다.
		userId: index === 12 ? null : `devPlayer${String(index + 1).padStart(3, '0')}`,
		displayName: NAMES[index % NAMES.length]!,
		championId: CHAMPIONS[index % CHAMPIONS.length]!,
		riotId: index % 3 === 0 ? `${NAMES[index % NAMES.length]}#KR${index + 1}` : null,
		riotAccountId: `${scrimId}-acc${index + 1}`,
		positions: POSITION_SETS[index % POSITION_SETS.length]!,
		status,
		registeredAt: new Date(Date.UTC(2026, 9, 20, 3, index * 7)).toISOString(),
		mmr: mockMmr(index)
	}));
}

const MMR_POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// 사람마다 주 포지션은 높고 나머지는 낮게, 같은 입력이면 항상 같은 값이 나오게 만든다.
function mockMmr(index: number): Record<LolPosition, number> {
	const main = POSITION_SETS[index % POSITION_SETS.length]!;
	return Object.fromEntries(
		MMR_POSITIONS.map((position, order) => [
			position,
			1500 + (main.includes(position) ? 120 : -60) + (((index + 3) * (order + 7) * 37) % 140) - 70
		])
	) as Record<LolPosition, number>;
}

const repeat = (status: RegistrationStatus, count: number): RegistrationStatus[] => Array(count).fill(status);

// 내 신청을 목록 맨 앞 참가자 자리에 넣는다.
function withMe(list: MockParticipant[], status: RegistrationStatus): MockParticipant[] {
	const [first, ...rest] = list;
	if (!first) return list;
	return [
		{
			...first,
			userId: mockUser.userId,
			displayName: mockUser.displayName,
			riotId: 'Hide on bush#KR1',
			riotAccountId: 'acc1',
			championId: mockMainChampion,
			status
		},
		...rest
	];
}

// 편성 방식별 진입과 서버 홈의 상태 표현을 확인할 수 있도록 상태·일정·내 신청을 섞어 둔다.
const scrims: MockScrim[] = [
	{
		guildId: 'devGuild001',
		id: 'devScrim001',
		title: '10월 정기 내전',
		status: 'recruit',
		scheduledAt: '2026-10-31T11:00:00Z',
		teamCount: 2,
		reserveCapacity: 2,
		formationMethod: 'manual',
		hardFearless: true,
		canManage: true,
		createdAt: '2026-10-20T00:00:00Z',
		// 신청 3 · 선발 8 · 철회 1 · 제외 1 → 활성 11/12명, 선발 8/10명
		participants: withMe(
			participants('devScrim001', [
				...repeat('pending', 3),
				...repeat('selected', 8),
				'withdrawn',
				'excluded'
			]),
			'pending'
		)
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim002',
		title: '경매 내전',
		status: 'preparing',
		scheduledAt: '2026-11-02T12:00:00Z',
		teamCount: 4,
		reserveCapacity: 0,
		formationMethod: 'auction',
		hardFearless: false,
		canManage: true,
		createdAt: '2026-10-22T00:00:00Z',
		participants: withMe(participants('devScrim002', repeat('selected', 20)), 'selected')
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim003',
		title: '방식 미정 내전',
		status: 'recruit',
		scheduledAt: null,
		teamCount: 2,
		reserveCapacity: 4,
		formationMethod: null,
		hardFearless: false,
		canManage: false,
		createdAt: '2026-10-29T00:00:00Z',
		participants: participants('devScrim003', repeat('pending', 3))
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim004',
		title: '금요일 칼바람 나락 내전 (초보 환영, 즐겜 위주)',
		status: 'in_progress',
		scheduledAt: '2026-10-30T12:00:00Z',
		teamCount: 2,
		reserveCapacity: 2,
		formationMethod: 'manual',
		hardFearless: false,
		canManage: false,
		createdAt: '2026-10-25T00:00:00Z',
		participants: withMe(participants('devScrim004', [...repeat('selected', 10), ...repeat('standby', 2)]), 'standby').reverse()
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim005',
		title: '10월 3주차 정기 내전',
		status: 'completed',
		scheduledAt: '2026-10-24T11:00:00Z',
		teamCount: 4,
		reserveCapacity: 0,
		formationMethod: 'auction',
		hardFearless: true,
		canManage: false,
		createdAt: '2026-10-15T00:00:00Z',
		participants: withMe(participants('devScrim005', repeat('selected', 20)), 'selected')
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim006',
		title: '마감 직전 주말 내전',
		status: 'recruit',
		scheduledAt: '2026-11-01T10:00:00Z',
		teamCount: 2,
		reserveCapacity: 0,
		formationMethod: 'manual',
		hardFearless: false,
		canManage: false,
		createdAt: '2026-10-26T00:00:00Z',
		participants: participants('devScrim006', [...repeat('selected', 6), ...repeat('pending', 4)])
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim007',
		title: '수동 편성 내전',
		status: 'preparing',
		scheduledAt: '2026-11-03T11:00:00Z',
		teamCount: 2,
		reserveCapacity: 0,
		formationMethod: 'manual',
		hardFearless: false,
		canManage: true,
		createdAt: '2026-10-27T00:00:00Z',
		participants: withMe(participants('devScrim007', repeat('selected', 10)), 'selected')
	},
	// 목록의 종료 필터와 쪽 나눔을 확인하기 위한 지난 내전이다.
	...Array.from({ length: 19 }, (_, index): MockScrim => {
		const scheduled = new Date(Date.UTC(2026, 9, 17 - index * 3, 11));
		const status: ScrimStatus = index === 4 ? 'cancelled' : index === 9 ? 'ended_early' : 'completed';
		const id = `devScrimPast${String(index + 1).padStart(2, '0')}`;
		return {
			guildId: 'devGuild001',
			id,
			title: `지난 내전 ${19 - index}회`,
			status,
			scheduledAt: scheduled.toISOString(),
			teamCount: 2,
			reserveCapacity: 0,
			formationMethod: status === 'cancelled' ? null : 'manual',
			hardFearless: index % 2 === 0,
			canManage: false,
			createdAt: new Date(scheduled.getTime() - 7 * 86_400_000).toISOString(),
			participants: participants(id, status === 'cancelled' ? repeat('withdrawn', 4) : repeat('selected', 10))
		};
	})
];

const ACTIVE: ScrimStatus[] = ['recruit', 'preparing', 'ready', 'in_progress'];
const DONE: ScrimStatus[] = ['completed', 'ended_early', 'cancelled'];
const ACTIVE_REGISTRATION: RegistrationStatus[] = ['pending', 'selected', 'standby'];

const FILTER: Record<Exclude<ScrimStatusFilter, 'all'>, ScrimStatus[]> = {
	recruit: ['recruit'],
	active: ['preparing', 'ready', 'in_progress'],
	done: DONE
};

// 팀 편성·경매 목(teams.ts)이 같은 저장소를 고쳐 쓰도록 원본 기록을 돌려준다.
export function findMockScrimRecord(guildId: string, scrimId: string) {
	return find(guildId, scrimId);
}

function find(guildId: string, scrimId: string) {
	return scrims.find((scrim) => scrim.guildId === guildId && scrim.id === scrimId) ?? null;
}

const activeRegistrations = (scrim: MockScrim) =>
	scrim.participants.filter((participant) => ACTIVE_REGISTRATION.includes(participant.status));

const capacity = (scrim: MockScrim) => playCapacity(scrim.teamCount) + scrim.reserveCapacity;

function myParticipant(scrim: MockScrim, userId: string | null) {
	if (!userId) return null;
	return activeRegistrations(scrim).find((participant) => participant.userId === userId) ?? null;
}

function toContext(scrim: MockScrim): ScrimContext {
	const { id, title, status, scheduledAt, teamCount, formationMethod, hardFearless, canManage } = scrim;
	return { id, title, status, scheduledAt, teamCount, formationMethod, hardFearless, canManage };
}

export function findMockScrim(guildId: string, scrimId: string): ScrimContext | null {
	const found = find(guildId, scrimId);
	return found ? toContext(found) : null;
}

const MEMBER_PREVIEW = 5;
const MEMBER_ORDER: RegistrationStatus[] = ['selected', 'pending', 'standby'];

// 목록 행의 얼굴 묶음은 선발된 사람부터 보여 준다.
function members(scrim: MockScrim, icon: IconResolver): ScrimMember[] {
	return activeRegistrations(scrim)
		.toSorted((a, b) => MEMBER_ORDER.indexOf(a.status) - MEMBER_ORDER.indexOf(b.status))
		.slice(0, MEMBER_PREVIEW)
		.map((participant) => ({ key: participant.registrationId, name: participant.displayName, iconUrl: icon(participant.championId) }));
}

function toListItem(scrim: MockScrim, icon: IconResolver): ScrimListItem {
	return {
		id: scrim.id,
		title: scrim.title,
		status: scrim.status,
		scheduledAt: scrim.scheduledAt,
		formationMethod: scrim.formationMethod,
		teamCount: scrim.teamCount,
		registered: activeRegistrations(scrim).length,
		capacity: capacity(scrim),
		myRegistration: myParticipant(scrim, mockUser.userId)?.status ?? null,
		members: members(scrim, icon)
	};
}

const bySchedule = (a: MockScrim, b: MockScrim) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999');

// 예정 시각이 있는 내전은 지금과 가까운 순으로(다가오는 내전 먼저, 지난 내전은 최근 순), 일정 미정은 생성 최신순으로 뒤에 둔다.
function byListOrder(now: number) {
	const rank = (scrim: MockScrim) => {
		if (!scrim.scheduledAt) return 2;
		return new Date(scrim.scheduledAt).getTime() >= now ? 0 : 1;
	};
	return (a: MockScrim, b: MockScrim) => {
		const diff = rank(a) - rank(b);
		if (diff) return diff;
		if (rank(a) === 0) return bySchedule(a, b);
		if (rank(a) === 1) return bySchedule(b, a);
		return b.createdAt.localeCompare(a.createdAt);
	};
}

export async function listMockScrims(
	guildId: string,
	options: { status: ScrimStatusFilter; page: number; pageSize: number },
	icon: IconResolver = noIcon
) {
	const inGuild = scrims.filter((scrim) => scrim.guildId === guildId);
	const matches = (filter: ScrimStatusFilter) => (scrim: MockScrim) =>
		filter === 'all' || FILTER[filter].includes(scrim.status);
	const filtered = inGuild.filter(matches(options.status)).sort(byListOrder(Date.now()));
	const start = (options.page - 1) * options.pageSize;
	return {
		scrims: filtered.slice(start, start + options.pageSize).map((scrim) => toListItem(scrim, icon)),
		total: filtered.length,
		counts: {
			all: inGuild.length,
			recruit: inGuild.filter(matches('recruit')).length,
			active: inGuild.filter(matches('active')).length,
			done: inGuild.filter(matches('done')).length
		} satisfies Record<ScrimStatusFilter, number>
	};
}

function activeScrims(guildId: string) {
	return scrims.filter((scrim) => scrim.guildId === guildId && ACTIVE.includes(scrim.status)).sort(bySchedule);
}

// 모집부터 진행까지의 내전을 예정 시각이 가까운 순으로, 일정 미정은 뒤에 둔다.
export async function listMockActiveScrims(guildId: string, icon: IconResolver = noIcon): Promise<ScrimListItem[]> {
	return activeScrims(guildId).map((scrim) => toListItem(scrim, icon));
}

const MY_PRIORITY: RegistrationStatus[] = ['selected', 'standby', 'pending'];

// 내가 참여하는 내전(선발 > 대기 > 신청, 같으면 진행 중 > 가까운 일정)을, 없으면 신청할 수 있는 가장 가까운 모집을 고른다.
export async function findMockNextScrim(guildId: string, icon: IconResolver = noIcon) {
	const active = activeScrims(guildId).map((scrim) => ({ scrim, mine: myParticipant(scrim, mockUser.userId)?.status ?? null }));
	const mine = active
		.filter(({ mine }) => mine && MY_PRIORITY.includes(mine))
		.sort(
			(a, b) =>
				MY_PRIORITY.indexOf(a.mine!) - MY_PRIORITY.indexOf(b.mine!) ||
				Number(b.scrim.status === 'in_progress') - Number(a.scrim.status === 'in_progress') ||
				bySchedule(a.scrim, b.scrim)
		)[0];
	const open = active.find(
		({ scrim, mine }) => scrim.status === 'recruit' && !mine && activeRegistrations(scrim).length < capacity(scrim)
	);
	const picked = (mine ?? open)?.scrim;
	if (!picked) return null;
	return { kind: mine ? ('mine' as const) : ('open' as const), scrim: toListItem(picked, icon), hardFearless: picked.hardFearless };
}

// 내전 머리의 배경으로 쓸 챔피언이다. 활성 신청자의 주 챔피언 중 가장 많은 것을, 신청자가 없으면 null을 준다.
export function getMockScrimSettings(guildId: string, scrimId: string): ScrimSettings | null {
	const scrim = find(guildId, scrimId);
	if (!scrim) return null;
	const { title, scheduledAt, teamCount, reserveCapacity, formationMethod, hardFearless } = scrim;
	return { title, scheduledAt, teamCount, reserveCapacity, formationMethod, hardFearless };
}

function counts(scrim: MockScrim): ScrimRegistrationCounts {
	const count = (status: RegistrationStatus) => scrim.participants.filter((participant) => participant.status === status).length;
	return {
		pending: count('pending'),
		selected: count('selected'),
		standby: count('standby'),
		withdrawn: count('withdrawn'),
		excluded: count('excluded'),
		activeCapacity: capacity(scrim),
		playCapacity: playCapacity(scrim.teamCount)
	};
}

// 상태 전이 정책은 미결정이다. 지금은 단계마다 다음 단계 하나와 화면에서 확인할 수 있는 조건만 둔다.
function nextAction(scrim: MockScrim): ScrimNextAction | null {
	const { selected, playCapacity } = counts(scrim);
	switch (scrim.status) {
		case 'recruit':
			return {
				key: 'close',
				label: '모집 마감',
				blockedReason:
					selected !== playCapacity
						? `선발 인원이 ${playCapacity}명이어야 해요 (현재 ${selected}명)`
						: !scrim.formationMethod
							? '내전 설정에서 편성 방식을 정해야 해요'
							: null
			};
		case 'preparing':
			return { key: 'ready', label: '대진 준비로', blockedReason: '팀 편성을 확정해야 해요' };
		case 'ready':
			return { key: 'start', label: '내전 시작', blockedReason: null };
		case 'in_progress':
			return { key: 'complete', label: '내전 종료', blockedReason: null };
		default:
			return null;
	}
}

const NEXT_STATUS: Record<ScrimNextAction['key'], ScrimStatus> = {
	close: 'preparing',
	ready: 'ready',
	start: 'in_progress',
	complete: 'completed'
};

export async function getMockScrimDetail(guildId: string, scrimId: string, userId: string | null, icon: IconResolver = noIcon) {
	await wait();
	const scrim = find(guildId, scrimId);
	if (!scrim) return null;
	const mine = myParticipant(scrim, userId);
	const myRegistration: MyRegistration | null = mine
		? { id: mine.registrationId, status: mine.status, riotAccountId: mine.riotAccountId, positions: [...mine.positions] }
		: null;
	return {
		participants: scrim.participants.map(
			({ riotAccountId: _, championId, mmr: __, ...participant }): ScrimParticipant => ({ ...participant, iconUrl: icon(championId) })
		),
		counts: counts(scrim),
		myRegistration,
		nextAction: scrim.canManage ? nextAction(scrim) : null
	};
}

export async function createMockScrim(guildId: string, settings: ScrimSettings) {
	await wait();
	const id = `devScrim${Date.now().toString(36)}`;
	scrims.push({
		...settings,
		guildId,
		id,
		status: 'recruit',
		canManage: true,
		createdAt: new Date().toISOString(),
		participants: []
	});
	return id;
}

export async function updateMockScrimSettings(guildId: string, scrimId: string, settings: ScrimSettings): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (playCapacity(settings.teamCount) < counts(scrim).selected) {
		return { status: 409, message: '선발 인원보다 실출전 정원을 작게 바꿀 수 없어요' };
	}
	Object.assign(scrim, settings);
	return null;
}

type RegistrationInput = { userId: string; displayName: string; riotAccountId: string; riotId: string; positions: LolPosition[] };

export async function registerMock(guildId: string, scrimId: string, input: RegistrationInput): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감됐어요' };
	if (myParticipant(scrim, input.userId)) return { status: 409, message: '이미 신청했어요' };
	if (activeRegistrations(scrim).length >= capacity(scrim)) return { status: 409, message: '신청 정원이 찼어요' };
	if (activeRegistrations(scrim).some((participant) => participant.riotAccountId === input.riotAccountId)) {
		return { status: 409, message: '이 Riot 계정은 이미 신청에 쓰였어요' };
	}
	scrim.participants.push({
		registrationId: `${scrimId}-r${Date.now().toString(36)}`,
		userId: input.userId,
		displayName: input.displayName,
		championId: mockMainChampion,
		riotId: input.riotId,
		riotAccountId: input.riotAccountId,
		positions: input.positions,
		status: 'pending',
		registeredAt: new Date().toISOString(),
		mmr: mockMmr(0)
	});
	return null;
}

export async function updateMockRegistration(
	guildId: string,
	scrimId: string,
	input: RegistrationInput
): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	const mine = scrim && myParticipant(scrim, input.userId);
	if (!scrim || !mine) return { status: 404, message: '신청 기록을 찾을 수 없어요' };
	if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감되어 바꿀 수 없어요' };
	Object.assign(mine, { riotAccountId: input.riotAccountId, riotId: input.riotId, positions: input.positions });
	return null;
}

export async function withdrawMock(guildId: string, scrimId: string, userId: string): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	const mine = scrim && myParticipant(scrim, userId);
	if (!scrim || !mine) return { status: 404, message: '이미 철회된 신청이에요' };
	if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감되어 철회할 수 없어요' };
	mine.status = 'withdrawn';
	return null;
}

export async function setMockParticipantStatus(
	guildId: string,
	scrimId: string,
	registrationIds: string[],
	status: 'selected' | 'standby' | 'excluded'
): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감되어 바꿀 수 없어요' };
	const targets = activeRegistrations(scrim).filter((participant) => registrationIds.includes(participant.registrationId));
	if (targets.length !== registrationIds.length) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	if (status === 'selected') {
		const after = counts(scrim).selected + targets.filter((participant) => participant.status !== 'selected').length;
		const limit = playCapacity(scrim.teamCount);
		if (after > limit) return { status: 409, message: `선발 인원은 ${limit}명을 넘을 수 없어요 (선택 후 ${after}명)` };
	}
	for (const participant of targets) participant.status = status;
	return null;
}

export async function advanceMockScrim(guildId: string, scrimId: string, key: string): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	const action = nextAction(scrim);
	if (!action || action.key !== key) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	if (action.blockedReason) return { status: 409, message: action.blockedReason };
	scrim.status = NEXT_STATUS[action.key];
	return null;
}

export async function cancelMockScrim(guildId: string, scrimId: string): Promise<MockFailure | null> {
	await wait();
	const scrim = find(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (DONE.includes(scrim.status)) return { status: 409, message: '이미 끝난 내전이에요' };
	scrim.status = 'cancelled';
	return null;
}
