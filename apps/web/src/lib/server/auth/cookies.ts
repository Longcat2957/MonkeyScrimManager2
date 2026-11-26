import { dev } from '$app/env';

// 운영 쿠키는 하위 도메인이나 다른 경로에서 덮어쓸 수 없는 접두사를 사용한다.
export const SESSION_COOKIE = dev ? 'monkeybot_session' : '__Host-monkeybot_session';
export const OAUTH_COOKIE = dev ? 'monkeybot_oauth' : '__Host-monkeybot_oauth';
export const authCookieOptions = { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax' } as const;
// 로그인 후 서버 진입(/servers)이 돌아갈 최근 방문 서버. 서버 ID만 담으며 권한 판단에 쓰지 않는다.
export const LAST_GUILD_COOKIE = dev ? 'monkeybot_last_guild' : '__Host-monkeybot_last_guild';
export const lastGuildCookieOptions = { ...authCookieOptions, maxAge: 60 * 60 * 24 * 365 } as const;
