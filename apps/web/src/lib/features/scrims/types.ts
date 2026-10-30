import type { scrimFormationMethod, scrimRegistrationStatus, scrimStatus } from '#lib/server/db/schema.ts';

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
};
