import { resolve } from '$app/paths';
import type { GuildContext } from '#lib/features/guild/types.ts';
import { bracketPath, formationPath, hasResult } from '#lib/features/scrims/paths.ts';
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
    return items.map(({ label, href, exact }) => ({
        label,
        href,
        current: isCurrent(pathname, href, exact)
    }));
}

export function scrimNavItems(guildId: string, scrim: ScrimContext, pathname: string): NavItem[] {
    const params = { guildId, scrimId: scrim.id };
    // 팀 편성은 방식을 고른 뒤에만 그 방식의 작업판을 가리킨다. 방식은 요약에서 고른다.
    const teams = formationPath(params, scrim.formationMethod);
    const items = [
        { label: '요약', href: resolve('/g/[guildId]/scrims/[scrimId]', params), exact: true },
        ...(teams ? [{ label: '팀 편성', href: teams }] : []),
        // 끝난 내전은 대진 대신 결과 화면을 가리킨다.
        { label: hasResult(scrim.status) ? '결과' : '대진', href: bracketPath(params, scrim.status) }
    ];
    return items.map(({ label, href, exact }) => ({
        label,
        href,
        current: isCurrent(pathname, href, exact)
    }));
}
