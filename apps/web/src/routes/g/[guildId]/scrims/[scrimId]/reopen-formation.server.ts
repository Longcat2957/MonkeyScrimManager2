import { dev } from '$app/env';
import { fail } from '@sveltejs/kit';
import { formationPath } from '#lib/features/scrims/paths.ts';
import { readFormationMethod } from '#lib/features/scrims/settings.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { reopenMockReadyFormation } from '#lib/mocks/workflow.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db/index.ts';
import { reopenFormation } from '#lib/server/scrims/workflow.ts';
import type { RequestEvent } from './$types';

export async function reopenFormationAction({
    params,
    locals,
    request,
    setHeaders
}: Pick<RequestEvent, 'params' | 'locals' | 'request' | 'setHeaders'>) {
    const data = await request.formData();
    const formationMethod = readFormationMethod(data.get('formationMethod'));
    if (!formationMethod) return fail(400, { message: '편성 방식을 확인해 주세요' });
    const revision = data.get('expectedRevision');
    const input = {
        formationMethod,
        expectedRevision: typeof revision === 'string' && revision.trim() ? Number(revision) : NaN
    };
    if (dev && findMockGuild(params.guildId)) {
        const failure = await reopenMockReadyFormation(params.guildId, params.scrimId, input);
        if (failure) return fail(failure.status, { message: failure.message });
    } else {
        try {
            await reopenFormation(getDb(), locals.actor, params.guildId, params.scrimId, input);
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    }
    return { nextHref: formationPath(params, formationMethod) };
}
