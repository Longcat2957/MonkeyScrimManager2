import type { RegistrationStatus, ScrimContext, ScrimListItem, ScrimStatus } from '#lib/features/scrims/types.ts';

type MockScrim = ScrimContext & {
	guildId: string;
	reserveCapacity: number;
	registered: number;
	myRegistration: RegistrationStatus | null;
};

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
		registered: 8,
		formationMethod: 'manual',
		hardFearless: true,
		canManage: true,
		myRegistration: 'pending'
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim002',
		title: '경매 내전',
		status: 'preparing',
		scheduledAt: '2026-11-02T12:00:00Z',
		teamCount: 4,
		reserveCapacity: 0,
		registered: 20,
		formationMethod: 'auction',
		hardFearless: false,
		canManage: true,
		myRegistration: 'selected'
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim003',
		title: '방식 미정 내전',
		status: 'recruit',
		scheduledAt: null,
		teamCount: 2,
		reserveCapacity: 4,
		registered: 3,
		formationMethod: null,
		hardFearless: false,
		canManage: false,
		myRegistration: null
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim004',
		title: '금요일 칼바람 나락 내전 (초보 환영, 즐겜 위주)',
		status: 'in_progress',
		scheduledAt: '2026-10-30T12:00:00Z',
		teamCount: 2,
		reserveCapacity: 2,
		registered: 12,
		formationMethod: 'manual',
		hardFearless: false,
		canManage: false,
		myRegistration: 'standby'
	},
	{
		guildId: 'devGuild001',
		id: 'devScrim005',
		title: '10월 3주차 정기 내전',
		status: 'completed',
		scheduledAt: '2026-10-24T11:00:00Z',
		teamCount: 4,
		reserveCapacity: 0,
		registered: 20,
		formationMethod: 'auction',
		hardFearless: true,
		canManage: false,
		myRegistration: 'selected'
	}
];

const ACTIVE: ScrimStatus[] = ['recruit', 'preparing', 'ready', 'in_progress'];

function toContext(scrim: MockScrim): ScrimContext {
	const { id, title, status, scheduledAt, teamCount, formationMethod, hardFearless, canManage } = scrim;
	return { id, title, status, scheduledAt, teamCount, formationMethod, hardFearless, canManage };
}

export function findMockScrim(guildId: string, scrimId: string): ScrimContext | null {
	const found = scrims.find((scrim) => scrim.guildId === guildId && scrim.id === scrimId);
	return found ? toContext(found) : null;
}

function toListItem(scrim: MockScrim): ScrimListItem {
	return {
		id: scrim.id,
		title: scrim.title,
		status: scrim.status,
		scheduledAt: scrim.scheduledAt,
		formationMethod: scrim.formationMethod,
		teamCount: scrim.teamCount,
		registered: scrim.registered,
		capacity: scrim.teamCount * 5 + scrim.reserveCapacity,
		myRegistration: scrim.myRegistration
	};
}

const bySchedule = (a: MockScrim, b: MockScrim) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999');

function activeScrims(guildId: string) {
	return scrims.filter((scrim) => scrim.guildId === guildId && ACTIVE.includes(scrim.status)).sort(bySchedule);
}

// 모집부터 진행까지의 내전을 예정 시각이 가까운 순으로, 일정 미정은 뒤에 둔다.
export async function listMockActiveScrims(guildId: string): Promise<ScrimListItem[]> {
	return activeScrims(guildId).map(toListItem);
}

const MY_PRIORITY: RegistrationStatus[] = ['selected', 'standby', 'pending'];

// 내가 참여하는 내전(선발 > 대기 > 신청, 같으면 진행 중 > 가까운 일정)을, 없으면 신청할 수 있는 가장 가까운 모집을 고른다.
export async function findMockNextScrim(guildId: string) {
	const active = activeScrims(guildId);
	const mine = active
		.filter((scrim) => scrim.myRegistration && MY_PRIORITY.includes(scrim.myRegistration))
		.sort(
			(a, b) =>
				MY_PRIORITY.indexOf(a.myRegistration!) - MY_PRIORITY.indexOf(b.myRegistration!) ||
				Number(b.status === 'in_progress') - Number(a.status === 'in_progress') ||
				bySchedule(a, b)
		)[0];
	const open = active.find((scrim) => scrim.status === 'recruit' && !scrim.myRegistration && scrim.registered < scrim.teamCount * 5 + scrim.reserveCapacity);
	const picked = mine ?? open;
	if (!picked) return null;
	return { kind: mine ? ('mine' as const) : ('open' as const), scrim: toListItem(picked), hardFearless: picked.hardFearless };
}
