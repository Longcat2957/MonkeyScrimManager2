import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PrivacyPreferences } from '#lib/features/me/privacy.ts';
import { getMockMe } from '#lib/mocks/me.ts';
import { getMockPrivacy, setMockPrivacy, withdrawMockAccount } from '#lib/mocks/privacy.ts';
import { getMyPrivacy, setMyPrivacy, withdrawAccount } from '#lib/server/accounts/privacy.ts';
import { listMyRiotAccounts } from '#lib/server/accounts/queries.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { OAUTH_COOKIE, SESSION_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { getDb } from '#lib/server/db/index.ts';
import { DomainError } from '#lib/server/errors.ts';
import { routeError } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

// 계정 연결은 서버 관리에서 하고 이 화면에서는 본인의 공개 설정·탈퇴만 처리한다.
export const load: PageServerLoad = async ({ parent, url, locals, request, setHeaders }) => {
    if (request.method === 'GET') setHeaders({ 'Cache-Control': 'no-store' });
    const { user } = await parent();
    if (dev && url.searchParams.get('mock') === '1') {
        if (!user) error(401, '로그인이 필요합니다.');
        const { riotAccounts } = getMockMe(url.searchParams.get('preview'));
        return {
            me: user,
            privacy: getMockPrivacy(),
            preview: true,
            groups: riotAccounts.length
                ? [{ guildId: 'devGuild001', guildName: '개발 서버', riotAccounts }]
                : []
        };
    }
    try {
        const actor = requireUser(locals.actor);
        if (!locals.user) error(401, '로그인이 필요합니다.');
        const [groups, privacy] = await Promise.all([
            listMyRiotAccounts(getDb(), actor),
            getMyPrivacy(getDb(), actor)
        ]);
        return { me: locals.user, groups, privacy, preview: false };
    } catch (cause) {
        routeError(cause);
    }
};

const value = (data: FormData, key: string) =>
    typeof data.get(key) === 'string' ? String(data.get(key)) : '';
function flag(data: FormData, key: string) {
    const raw = value(data, key);
    if (raw !== 'true' && raw !== 'false')
        throw new DomainError('INVALID_INPUT', '공개 설정을 다시 확인해 주세요');
    return raw === 'true';
}

export const actions: Actions = {
    privacy: async ({ request, url, locals, setHeaders }) => {
        setHeaders({ 'Cache-Control': 'no-store' });
        let values: PrivacyPreferences | undefined;
        try {
            const preview = dev && url.searchParams.get('mock') === '1';
            if (!preview) requireUser(locals.actor);
            const data = await request.formData();
            values = {
                publicProfile: flag(data, 'publicProfile'),
                publicRiotIds: flag(data, 'publicRiotIds')
            };
            if (preview) setMockPrivacy(values);
            else await setMyPrivacy(getDb(), locals.actor, values);
            return { saved: true };
        } catch (cause) {
            const failure = actionFailure(cause, setHeaders);
            return fail(failure.status, { ...failure.data, action: 'privacy', values });
        }
    },
    withdraw: async ({ request, url, locals, cookies, setHeaders }) => {
        setHeaders({ 'Cache-Control': 'no-store' });
        try {
            const preview = dev && url.searchParams.get('mock') === '1';
            if (!preview) requireUser(locals.actor);
            const agreed = value(await request.formData(), 'confirm') === 'true';
            if (preview) withdrawMockAccount(agreed);
            else {
                await withdrawAccount(getDb(), locals.actor, { confirm: agreed });
                cookies.delete(SESSION_COOKIE, authCookieOptions);
                cookies.delete(OAUTH_COOKIE, authCookieOptions);
                locals.actor = null;
                locals.user = null;
                locals.session = null;
            }
            redirect(303, '/');
        } catch (cause) {
            const failure = actionFailure(cause, setHeaders);
            return fail(failure.status, { ...failure.data, action: 'withdraw' });
        }
    }
};
