import type {
	FormationMethod,
	NewScrimInput,
	Position,
	Registration,
	ScrimStatus,
	ScrimSummary
} from '#lib/data/types.ts';
import { POSITIONS } from '#lib/data/types.ts';
import { USERS } from './guilds.ts';

/*
 * 개발용 내전 표본.
 * 상태·정원·편성 방식·참가 인원이 서로 다른 경우를 고정값으로 준비한다.
 */

export interface MockScrim extends ScrimSummary {
	guildId: string;
	createdAt: string;
	registrations: Registration[];
}

interface ScrimSeed {
	id: string;
	guildId: string;
	title: string;
	status: ScrimStatus;
	formationMethod: FormationMethod | null;
	teamCount: number;
	reserveCapacity: number;
	applicantCount: number;
	selectedCount: number;
	expectedStartAt: string | null;
	isHardFearless: boolean;
	createdAt: string;
	/** 포지션을 지정하지 않은 신청 수 */
	unassignedPositions?: number;
}

function buildRegistrations(seed: ScrimSeed): Registration[] {
	return Array.from({ length: seed.applicantCount }, (_, index) => {
		const user = USERS[index % USERS.length];
		const status = index < seed.selectedCount ? 'selected' : 'pending';
		const positions: Position[] =
			index < seed.applicantCount - (seed.unassignedPositions ?? 0) ? [POSITIONS[index % POSITIONS.length]] : [];

		return {
			participantId: `${seed.id}-p${String(index + 1).padStart(2, '0')}`,
			player: { userId: user.id, displayName: user.displayName, riotId: user.riotId },
			status,
			positions,
			joinedAt: seed.createdAt,
			teamId: null,
			teamPosition: null
		};
	});
}

function buildScrim(seed: ScrimSeed): MockScrim {
	const playingCapacity = seed.teamCount * 5;
	return {
		id: seed.id,
		guildId: seed.guildId,
		title: seed.title,
		status: seed.status,
		formationMethod: seed.formationMethod,
		teamCount: seed.teamCount,
		playingCapacity,
		appliedCapacity: playingCapacity + seed.reserveCapacity,
		applicantCount: seed.applicantCount,
		selectedCount: seed.selectedCount,
		expectedStartAt: seed.expectedStartAt,
		isHardFearless: seed.isHardFearless,
		createdAt: seed.createdAt,
		registrations: buildRegistrations(seed)
	};
}

const SEEDS: ScrimSeed[] = [
	{
		id: 'scrim-1001',
		guildId: 'monkey-dorm',
		title: '30일 밤 내전 #12',
		status: 'recruit',
		formationMethod: 'auction',
		teamCount: 2,
		reserveCapacity: 2,
		applicantCount: 9,
		selectedCount: 7,
		expectedStartAt: '2026-10-30T20:00:00+09:00',
		isHardFearless: true,
		createdAt: '2026-10-29T19:10:00+09:00',
		unassignedPositions: 2
	},
	{
		id: 'scrim-1002',
		guildId: 'monkey-dorm',
		title: '주말 5v5',
		status: 'preparing',
		formationMethod: 'manual',
		teamCount: 2,
		reserveCapacity: 0,
		applicantCount: 10,
		selectedCount: 10,
		expectedStartAt: '2026-10-31T19:00:00+09:00',
		isHardFearless: false,
		createdAt: '2026-10-29T12:00:00+09:00'
	},
	{
		id: 'scrim-1003',
		guildId: 'monkey-dorm',
		title: '목요 경매 내전',
		status: 'in_progress',
		formationMethod: 'auction',
		teamCount: 4,
		reserveCapacity: 4,
		applicantCount: 24,
		selectedCount: 20,
		expectedStartAt: '2026-10-29T20:00:00+09:00',
		isHardFearless: true,
		createdAt: '2026-10-28T18:00:00+09:00'
	},
	{
		id: 'scrim-1004',
		guildId: 'monkey-dorm',
		title: '10월 정규전 #9',
		status: 'completed',
		formationMethod: 'manual',
		teamCount: 2,
		reserveCapacity: 0,
		applicantCount: 10,
		selectedCount: 10,
		expectedStartAt: '2026-10-28T20:30:00+09:00',
		isHardFearless: true,
		createdAt: '2026-10-27T10:00:00+09:00'
	},
	{
		id: 'scrim-1005',
		guildId: 'monkey-dorm',
		title: '초급자 내전',
		status: 'ended_early',
		formationMethod: 'manual',
		teamCount: 2,
		reserveCapacity: 0,
		applicantCount: 10,
		selectedCount: 10,
		expectedStartAt: '2026-10-27T21:00:00+09:00',
		isHardFearless: false,
		createdAt: '2026-10-26T15:00:00+09:00'
	},
	{
		id: 'scrim-1006',
		guildId: 'monkey-dorm',
		title: '월요 내전',
		status: 'cancelled',
		formationMethod: null,
		teamCount: 2,
		reserveCapacity: 0,
		applicantCount: 3,
		selectedCount: 0,
		expectedStartAt: null,
		isHardFearless: false,
		createdAt: '2026-10-26T09:00:00+09:00'
	},
	{
		id: 'scrim-2001',
		guildId: 'evening-club',
		title: '저녁 5v5',
		status: 'recruit',
		formationMethod: 'manual',
		teamCount: 2,
		reserveCapacity: 2,
		applicantCount: 6,
		selectedCount: 4,
		expectedStartAt: '2026-10-30T21:00:00+09:00',
		isHardFearless: true,
		createdAt: '2026-10-29T18:00:00+09:00'
	},
	{
		id: 'scrim-2002',
		guildId: 'evening-club',
		title: '수요 정규전',
		status: 'completed',
		formationMethod: 'manual',
		teamCount: 2,
		reserveCapacity: 0,
		applicantCount: 10,
		selectedCount: 10,
		expectedStartAt: '2026-10-28T21:00:00+09:00',
		isHardFearless: false,
		createdAt: '2026-10-27T11:00:00+09:00'
	},
	{
		id: 'scrim-3001',
		guildId: 'weekend-scrim',
		title: '주말 경매전',
		status: 'recruit',
		formationMethod: 'auction',
		teamCount: 4,
		reserveCapacity: 0,
		applicantCount: 12,
		selectedCount: 9,
		expectedStartAt: '2026-11-01T18:00:00+09:00',
		isHardFearless: true,
		createdAt: '2026-10-29T20:30:00+09:00'
	}
];

/** 편집 가능한 목 저장소. 개발 중 생성한 내전이 같은 세션에서 보이도록 배열을 직접 갱신한다. */
export const SCRIMS: MockScrim[] = SEEDS.map(buildScrim);

let createdSequence = 0;

/** 새 모집을 목록 맨 앞에 추가한다. 실제 서비스에서는 서버가 같은 값을 만든다. */
export function addScrim(guildId: string, input: NewScrimInput): MockScrim {
	createdSequence += 1;
	const id = `scrim-new-${createdSequence}`;
	const playingCapacity = input.teamCount * 5;
	const scrim: MockScrim = {
		id,
		guildId,
		title: input.title,
		status: 'recruit',
		formationMethod: input.formationMethod,
		teamCount: input.teamCount,
		playingCapacity,
		appliedCapacity: playingCapacity + input.reserveCapacity,
		applicantCount: 0,
		selectedCount: 0,
		expectedStartAt: input.expectedStartAt,
		isHardFearless: input.isHardFearless,
		createdAt: new Date().toISOString(),
		registrations: []
	};
	SCRIMS.unshift(scrim);
	return scrim;
}

export function findScrim(scrimId: string): MockScrim | undefined {
	return SCRIMS.find((scrim) => scrim.id === scrimId);
}

/** 모집 마감처럼 운영 단계만 바꾼다. 편성 방식이 없으면 편성 단계로 넘기지 않는다. */
export function setScrimStatus(scrimId: string, status: ScrimStatus): boolean {
	const scrim = findScrim(scrimId);
	if (!scrim) return false;
	if (status !== 'recruit' && status !== 'cancelled' && !scrim.formationMethod) return false;
	scrim.status = status;
	return true;
}

/** 참가 신청. 같은 사용자의 중복 신청은 추가하지 않는다. */
export function registerParticipant(
	scrimId: string,
	player: { userId: string; displayName: string; riotId: string | null },
	positions: Position[]
): Registration | null {
	const scrim = findScrim(scrimId);
	if (!scrim) return null;
	if (scrim.registrations.some((registration) => registration.player.userId === player.userId)) return null;
	if (scrim.applicantCount >= scrim.appliedCapacity) return null;

	const registration: Registration = {
		participantId: `${scrim.id}-p${String(scrim.registrations.length + 1).padStart(2, '0')}`,
		player,
		status: 'pending',
		positions,
		joinedAt: new Date().toISOString(),
		teamId: null,
		teamPosition: null
	};
	scrim.registrations.push(registration);
	scrim.applicantCount += 1;
	return registration;
}

/** 신청 철회. 참가 행은 지우지 않고 상태만 닫는다. */
export function withdrawRegistration(scrimId: string, participantId: string): boolean {
	const scrim = findScrim(scrimId);
	const registration = scrim?.registrations.find((item) => item.participantId === participantId);
	if (!scrim || !registration || registration.status === 'withdrawn') return false;

	if (registration.status === 'selected') scrim.selectedCount = Math.max(0, scrim.selectedCount - 1);
	registration.status = 'withdrawn';
	scrim.applicantCount = Math.max(0, scrim.applicantCount - 1);
	return true;
}

/** 선발·대기·제외 처리. */
export function setRegistrationStatus(
	scrimId: string,
	participantId: string,
	status: 'selected' | 'standby' | 'excluded'
): boolean {
	const scrim = findScrim(scrimId);
	const registration = scrim?.registrations.find((item) => item.participantId === participantId);
	if (!scrim || !registration || registration.status === 'withdrawn') return false;

	const previous = registration.status;
	// 선발 인원은 실출전 정원을 넘지 않는다.
	if (status === 'selected' && previous !== 'selected' && scrim.selectedCount >= scrim.playingCapacity) {
		return false;
	}

	if (previous === 'selected' && status !== 'selected') scrim.selectedCount = Math.max(0, scrim.selectedCount - 1);
	if (status === 'selected' && previous !== 'selected') scrim.selectedCount += 1;
	// 제외는 신청을 닫고 정원에서 뺀다(철회와 구분되는 운영 처리).
	if (status === 'excluded' && previous !== 'excluded') scrim.applicantCount = Math.max(0, scrim.applicantCount - 1);

	registration.status = status;
	return true;
}

/** 목록·홈에서 쓰는 요약 값만 꺼낸다. registrations 참조를 화면으로 넘기지 않는다. */
export function toSummary(scrim: MockScrim): ScrimSummary {
	const { registrations: _registrations, guildId: _guildId, createdAt: _createdAt, ...summary } = scrim;
	return summary;
}
