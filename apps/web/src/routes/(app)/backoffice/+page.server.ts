import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { listMockServiceAdmins, setMockServiceAdmin } from '#lib/mocks/backoffice.ts';
import { mockUser } from '#lib/mocks/session.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { requireServiceAdmin } from '#lib/server/auth/guards.ts';
import { getDb } from '#lib/server/db/index.ts';
import { DomainError } from '#lib/server/errors.ts';
import { routeError } from '#lib/server/http.ts';
import { getServiceAdminOverview, setServiceAdmin } from '#lib/server/service-admin/service.ts';
import { checkServices } from '#lib/server/status.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;
const field = (data: FormData, name: string) =>
    typeof data.get(name) === 'string' ? String(data.get(name)) : '';

// 서버 관리자 권한으로 대체하지 않고 서비스 운영자만 연다.
export const load: PageServerLoad = async ({ parent, depends, locals, url }) => {
    const preview = dev && url.searchParams.get('mock') === '1';
    const requestedPage = Number(url.searchParams.get('page'));
    const page =
        Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100_000
            ? requestedPage
            : 1;
    try {
        let currentUserId: string;
        if (preview) {
            const { user } = await parent();
            if (!user?.isServiceAdmin) error(403, '서비스 운영자만 볼 수 있어요.');
            currentUserId = user.userId;
        } else {
            requireServiceAdmin(locals.actor);
            currentUserId = locals.actor!.userId;
        }
        const overview = preview
            ? listMockServiceAdmins(page, PAGE_SIZE)
            : await getServiceAdminOverview(getDb(), locals.actor, { page, pageSize: PAGE_SIZE });
        depends('app:service-status', 'app:service-admins');
        // 확인이 끝나기 전에 화면을 먼저 보여 주도록 결과를 스트리밍한다.
        return { status: checkServices(), overview, page, pageSize: PAGE_SIZE, currentUserId };
    } catch (cause) {
        routeError(cause);
    }
};

export const actions: Actions = {
    setServiceAdmin: async ({ request, locals, url, setHeaders }) => {
        try {
            const data = await request.formData();
            const enabled = field(data, 'enabled');
            if (enabled !== 'true' && enabled !== 'false')
                throw new DomainError('INVALID_INPUT', '운영자 지정 또는 해제를 선택해 주세요');
            const targetUserId = field(data, 'userId');
            const result =
                dev && url.searchParams.get('mock') === '1'
                    ? setMockServiceAdmin(mockUser.userId, targetUserId, enabled === 'true')
                    : await setServiceAdmin(getDb(), locals.actor, targetUserId, enabled === 'true');
            if (result.selfRevoked) redirect(303, '/me');
            return { changed: result.changed };
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    }
};
