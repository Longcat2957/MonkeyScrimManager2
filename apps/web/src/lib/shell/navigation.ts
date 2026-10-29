import { resolve } from '$app/paths';
import type { GuildContext, ScrimContext } from '#lib/shell/context.ts';
import type { Destination } from '#lib/shell/destinations.ts';

export { activeDestination, type Destination } from '#lib/shell/destinations.ts';

export interface RailContent {
	/** 레일의 접근 가능한 이름(서버 | 내전). 전역 문맥이면 null. */
	label: string | null;
	items: Destination[];
}

const EMPTY_RAIL: RailContent = { label: null, items: [] };

/** 전역 페이지는 레일 목적지가 없다. 홈 이동은 브랜드 링크가 담당한다. */
export function globalDestinations(): RailContent {
	return EMPTY_RAIL;
}

/** 서버 문맥의 레일: 서버 홈·내전·경기 기록·통계·관리. 관리 항목은 권한이 있을 때만 넣는다. */
export function guildDestinations(guild: GuildContext): RailContent {
	const items: Destination[] = [
		{
			label: '서버 홈',
			href: resolve('/g/[guildId]', { guildId: guild.id }),
			match: `/g/${guild.id}`,
			exact: true
		},
		{
			label: '내전',
			href: resolve('/g/[guildId]/scrims', { guildId: guild.id }),
			match: `/g/${guild.id}/scrims`
		},
		{
			label: '경기 기록',
			href: resolve('/g/[guildId]/matches', { guildId: guild.id }),
			match: `/g/${guild.id}/matches`
		},
		{
			label: '통계',
			href: resolve('/g/[guildId]/stats', { guildId: guild.id }),
			match: `/g/${guild.id}/stats`
		}
	];

	if (guild.viewerRole === 'admin') {
		items.push({
			label: '관리',
			href: resolve('/g/[guildId]/admin', { guildId: guild.id }),
			match: `/g/${guild.id}/admin`
		});
	}

	return { label: '서버', items };
}

/**
 * 내전 문맥의 레일: 요약·팀 편성·대진.
 * 서버 전체 목적지는 여기 넣지 않는다. 헤더의 서버 선택기가 담당한다.
 */
export function scrimDestinations(guildId: string, scrim: ScrimContext): RailContent {
	return {
		label: '내전',
		items: [
			{
				label: '요약',
				href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: scrim.id }),
				match: `/g/${guildId}/scrims/${scrim.id}`,
				exact: true
			},
			{
				label: '팀 편성',
				href: resolve('/g/[guildId]/scrims/[scrimId]/teams', { guildId, scrimId: scrim.id }),
				match: `/g/${guildId}/scrims/${scrim.id}/teams`
			},
			{
				label: '대진',
				href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', { guildId, scrimId: scrim.id }),
				match: `/g/${guildId}/scrims/${scrim.id}/bracket`
			}
		]
	};
}

/** 현재 문맥에 맞는 레일 하나를 고른다. 내전 > 서버 > 전역 순이다. */
export function destinationsFor(
	guild: GuildContext | null,
	scrim: ScrimContext | null
): RailContent {
	if (guild && scrim) return scrimDestinations(guild.id, scrim);
	if (guild) return guildDestinations(guild);
	return globalDestinations();
}
