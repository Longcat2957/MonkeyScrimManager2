import { resolve } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import { LAST_GUILD_COOKIE } from '#lib/server/auth/cookies.ts';
import type { PageServerLoad } from './$types';

// 서버 진입은 화면 없이 대표 서버로 보낸다. 다른 서버로의 전환은 서버 화면의 서버 선택이 맡는다.
export const load: PageServerLoad = async ({ parent, setHeaders, cookies }) => {
    setHeaders({ 'Cache-Control': 'private, no-store' });
    const { authenticated, mockPreview, guilds, guildListError } = await parent();
    if (!authenticated && !mockPreview) redirect(303, resolve('/(site)'));
    // 목록 조회 실패는 공통 오류 화면의 다시 시도로 복구한다.
    if (guildListError) error(503, guildListError);
    if (!guilds.length) redirect(303, resolve('/(site)/discord'));
    // 최근 방문 서버가 여전히 접근 가능하면 그 서버, 아니면 이름순 첫 서버를 대표 서버로 쓴다.
    const recent = guilds.find((guild) => guild.id === cookies.get(LAST_GUILD_COOKIE));
    const [first] = guilds.toSorted((a, b) => a.name.localeCompare(b.name, 'ko'));
    redirect(303, resolve('/g/[guildId]', { guildId: (recent ?? first)!.id }));
};
