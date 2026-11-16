import { resolve } from '$app/paths';
import type { GuildContext } from '#lib/features/guild/types.ts';
import { formationPath, hasResult } from '#lib/features/scrims/paths.ts';
import type { ScrimContext } from '#lib/features/scrims/types.ts';

export type NavItem = {
    label: string;
    href: string;
    current: boolean;
    static?: boolean;
    disabled?: boolean;
};

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
        current: isCurrent(pathname, href, exact),
        // 관리 화면 안의 보기 전환과 같은 이동을 헤더에 중복하지 않는다.
        static: label === '관리' && pathname === href
    }));
}

export function scrimNavItems(guildId: string, scrim: ScrimContext, pathname: string): NavItem[] {
    const params = { guildId, scrimId: scrim.id };
    const overview = resolve('/g/[guildId]/scrims/[scrimId]', params);
    const teams = formationPath(params, scrim.formationMethod);
    const finished = hasResult(scrim.status);
    const matchPage = pathname.startsWith(`${resolve('/g/[guildId]/matches', { guildId })}/`);
    const items = [
        { label: '모집·참가자', href: overview },
        { label: '팀 편성', href: teams ?? overview, disabled: !teams },
        {
            label: '대진·경기',
            href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', params),
            disabled: finished,
            current: matchPage && !finished
        },
        {
            label: '결과',
            href: resolve('/g/[guildId]/scrims/[scrimId]/result', params),
            disabled: !finished,
            current: matchPage && finished
        }
    ];
    return items.map(({ label, href, disabled, current }) => ({
        label,
        href,
        disabled,
        current: !disabled && (current || isCurrent(pathname, href, true))
    }));
}
