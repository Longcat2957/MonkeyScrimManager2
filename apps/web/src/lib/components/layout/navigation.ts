import { resolve } from '$app/paths';
import type { GuildContext } from '#lib/features/guild/types.ts';
import type { ScrimContext } from '#lib/features/scrims/types.ts';

export type NavItem = { label: string; href: string; current: boolean };

// 하위 경로까지 현재 항목으로 표시한다. exact는 홈·요약처럼 하위 메뉴가 따로 있는 항목에 쓴다.
function isCurrent(pathname: string, href: string, exact = false) {
	return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function guildNavItems(guild: GuildContext, pathname: string): NavItem[] {
	const guildId = guild.id;
	const items = [
		{ label: '서버 홈', href: resolve('/g/[guildId]', { guildId }), exact: true },
		{ label: '내전', href: resolve('/g/[guildId]/scrims', { guildId }) },
		{ label: '경기 기록', href: resolve('/g/[guildId]/matches', { guildId }) },
		{ label: '통계', href: resolve('/g/[guildId]/stats', { guildId }) },
		...(guild.isAdmin ? [{ label: '관리', href: resolve('/g/[guildId]/admin', { guildId }) }] : [])
	];
	return items.map(({ label, href, exact }) => ({ label, href, current: isCurrent(pathname, href, exact) }));
}

export function scrimNavItems(guildId: string, scrim: ScrimContext, pathname: string): NavItem[] {
	const params = { guildId, scrimId: scrim.id };
	const items = [
		{ label: '요약', href: resolve('/g/[guildId]/scrims/[scrimId]', params), exact: true },
		// 팀 편성은 공통 진입점 하나를 가리키고 manual·auction 하위 경로에서도 현재 항목이다.
		{ label: '팀 편성', href: resolve('/g/[guildId]/scrims/[scrimId]/teams', params) },
		{ label: '대진', href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', params) }
	];
	return items.map(({ label, href, exact }) => ({ label, href, current: isCurrent(pathname, href, exact) }));
}
