import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PrivacyPreferences } from '#lib/features/me/privacy.ts';
import { CHAMPION_PREFERENCE_POSITIONS, type ChampionPreferenceInput } from '#lib/features/me/champions.ts';
import { getMockChampionPreferences, replaceMockChampionPreferences } from '#lib/mocks/champions.ts';
import { getMockMe } from '#lib/mocks/me.ts';
import { getMockPrivacy, setMockPrivacy, withdrawMockAccount } from '#lib/mocks/privacy.ts';
import { getMyPrivacy, setMyPrivacy, withdrawAccount } from '#lib/server/accounts/privacy.ts';
import { listMyRiotAccounts } from '#lib/server/accounts/queries.ts';
import { getMyChampionPreferences, replaceMyChampionPreferences } from '#lib/server/accounts/champions.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { OAUTH_COOKIE, SESSION_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { getDb } from '#lib/server/db/index.ts';
import { DomainError } from '#lib/server/errors.ts';
import { routeError } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

// 계정 연결은 서버 관리에서 하고 이 화면에서는 본인의 선호·공개 설정·탈퇴를 처리한다.
export const load: PageServerLoad = async ({ parent, url, locals, request, setHeaders, depends }) => {
    depends('app:champion-preferences');
    if (request.method === 'GET') setHeaders({ 'Cache-Control': 'no-store' });
    const { user } = await parent();
    if (dev && url.searchParams.get('mock') === '1') {
        if (!user) error(401, '로그인이 필요합니다.');
        const { riotAccounts } = getMockMe(url.searchParams.get('preview'));
        return {
            me: user,
            privacy: getMockPrivacy(),
            championPreferences: await getMockChampionPreferences(),
            preview: true,
            groups: riotAccounts.length
                ? [{ guildId: 'devGuild001', guildName: '개발 서버', riotAccounts }]
                : []
        };
    }
    try {
        const actor = requireUser(locals.actor);
        if (!locals.user) error(401, '로그인이 필요합니다.');
        const [groups, privacy, championPreferences] = await Promise.all([
            listMyRiotAccounts(getDb(), actor),
            getMyPrivacy(getDb(), actor),
            getMyChampionPreferences(getDb(), actor)
        ]);
        return { me: locals.user, groups, privacy, championPreferences, preview: false };
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
    champions: async ({ request, url, locals, setHeaders }) => {
        setHeaders({ 'Cache-Control': 'no-store' });
        let values: ChampionPreferenceInput | undefined;
        try {
            const preview = dev && url.searchParams.get('mock') === '1';
            if (!preview) requireUser(locals.actor);
            const data = await request.formData();
            const positions = data.getAll('position');
            const position = positions[0];
            if (
                positions.length !== 1 ||
                typeof position !== 'string' ||
                !CHAMPION_PREFERENCE_POSITIONS.some((entry) => entry === position)
            )
                throw new DomainError('INVALID_INPUT', '선호 포지션을 다시 선택해 주세요');
            const ids = data.getAll('championIds');
            const valid = (entry: FormDataEntryValue): entry is string =>
                typeof entry === 'string' && /^[1-9]\d*$/.test(entry) && Number.isSafeInteger(Number(entry));
            values = {
                position: position as ChampionPreferenceInput['position'],
                championIds: ids.filter(valid).map(Number)
            };
            if (!ids.every(valid)) throw new DomainError('INVALID_INPUT', '챔피언 선택을 다시 확인해 주세요');
            const championPreferences = preview
                ? await replaceMockChampionPreferences(values)
                : await replaceMyChampionPreferences(getDb(), locals.actor, values);
            return { championsSaved: true, championPreferences };
        } catch (cause) {
            const failure = actionFailure(cause, setHeaders);
            return fail(failure.status, { ...failure.data, action: 'champions' as const, values });
        }
    },
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
            return fail(failure.status, { ...failure.data, action: 'privacy' as const, values });
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
            return fail(failure.status, { ...failure.data, action: 'withdraw' as const });
        }
    }
};
