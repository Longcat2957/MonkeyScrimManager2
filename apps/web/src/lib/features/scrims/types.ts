import type { scrimFormationMethod, scrimRegistrationStatus, scrimStatus } from '#lib/server/db/schema.ts';
import type { LolPosition } from '#lib/features/guild/types.ts';

export type ScrimStatus = (typeof scrimStatus.enumValues)[number];
export type FormationMethod = (typeof scrimFormationMethod.enumValues)[number];
export type RegistrationStatus = (typeof scrimRegistrationStatus.enumValues)[number];

// 내전 하위 레이아웃이 내려주는 요약이다. ScrimSummary와 내전 범위 헤더가 사용한다.
export type ScrimContext = {
	id: string;
	title: string;
	status: ScrimStatus;
	scheduledAt: string | null;
	teamCount: number;
	formationMethod: FormationMethod | null;
	hardFearless: boolean;
	canManage: boolean;
};

// 목록 행에 얼굴로 보여 줄 참가자다. iconUrl은 주 챔피언 아이콘이고 없으면 이름 첫 글자로 대신한다.
export type ScrimMember = {
	key: string;
	name: string;
	iconUrl: string | null;
};

// 서버 홈·내전 목록의 한 행이다. registered/capacity는 활성 신청 수와 전체 신청 정원(실출전 + 추가 신청)이다.
export type ScrimListItem = {
	id: string;
	title: string;
	status: ScrimStatus;
	scheduledAt: string | null;
	formationMethod: FormationMethod | null;
	teamCount: number;
	registered: number;
	capacity: number;
	myRegistration: RegistrationStatus | null;
	// 활성 신청자 중 앞쪽 몇 명(선발 우선)이다. 전체 수는 registered다.
	members: ScrimMember[];
};

// 내전 목록의 상태 필터다. active는 편성 중·대진 준비·진행 중, done은 종료·중도 종료·취소를 묶는다.
export type ScrimStatusFilter = 'all' | 'recruit' | 'active' | 'done';

// 모집 생성·내전 설정 수정 팝업이 주고받는 값이다. scheduledAt이 null이면 일정 미정이다.
export type ScrimSettings = {
	title: string;
	scheduledAt: string | null;
	teamCount: number;
	reserveCapacity: number;
	formationMethod: FormationMethod | null;
	hardFearless: boolean;
};

export type ScrimSettingsField = keyof ScrimSettings;

// 내전 요약의 참가자 한 명이다. userId가 없으면 사용자 연결이 사라진 과거 기록이다.
export type ScrimParticipant = {
	registrationId: string;
	userId: string | null;
	displayName: string;
	// 주 챔피언 아이콘. 없으면 이름 첫 글자로 대신한다.
	iconUrl: string | null;
	// 본인이 공개를 허용했을 때만 값이 있다.
	riotId: string | null;
	positions: LolPosition[];
	status: RegistrationStatus;
	registeredAt: string;
};

export type RegistrationAccount = {
	id: string;
	riotId: string;
};

export type MyRegistration = {
	id: string;
	status: RegistrationStatus;
	riotAccountId: string;
	positions: LolPosition[];
};

// 운영자가 다음 단계로 넘기는 작업이다. blockedReason이 있으면 버튼을 비활성으로 두고 이유를 보여 준다.
export type ScrimNextAction = {
	key: 'close' | 'ready' | 'start' | 'complete';
	label: string;
	blockedReason: string | null;
};

export type ScrimRegistrationCounts = Record<RegistrationStatus, number> & {
	// 활성 신청(신청·선발·대기)의 정원과 실출전 정원이다.
	activeCapacity: number;
	playCapacity: number;
};
