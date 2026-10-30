import type { ScrimContext } from '#lib/features/scrims/types.ts';
import { SCRIM_STATUS } from '#lib/features/labels.ts';

export const demoScrim: ScrimContext = {
	id: 'demoScrim',
	title: '아주 긴 이름을 가진 10월 마지막 주 금요일 정기 내전',
	status: 'preparing',
	scheduledAt: '2026-10-31T11:00:00Z',
	teamCount: 4,
	formationMethod: 'auction',
	hardFearless: true,
	canManage: true
};

export const demoStatuses = Object.entries(SCRIM_STATUS).map(([key, label]) => ({ key, ...label }));
