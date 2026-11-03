import { dev } from '$app/env';

// 운영 쿠키는 하위 도메인이나 다른 경로에서 덮어쓸 수 없는 접두사를 사용한다.
export const SESSION_COOKIE = dev ? 'monkeybot_session' : '__Host-monkeybot_session';
export const OAUTH_COOKIE = dev ? 'monkeybot_oauth' : '__Host-monkeybot_oauth';
export const authCookieOptions = { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax' } as const;
