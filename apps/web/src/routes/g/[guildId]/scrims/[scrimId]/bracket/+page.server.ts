import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { bracketPath, hasResult } from '#lib/features/scrims/paths.ts';
import {
    confirmMockBracket,
    getMockBracket,
    placeMockBracketTeam,
    resetMockBracket,
    setMockBracketBestOf,
    unlockMockBracket
} from '#lib/mocks/bracket.ts';
import type { MockFailure } from '#lib/mocks/scrims.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { routeError } from '#lib/server/http.ts';
import {
    getBracket,
    placeBracketTeam,
    setBracketBestOf,
    resetBracket,
    confirmBracket,
    unlockBracket
} from '#lib/server/scrims/bracket.ts';
import type { Actions, PageServerLoad } from './$types';

const isDemo = (guildId: string) => dev && Boolean(findMockGuild(guildId));

export const load: PageServerLoad = async ({ parent, params, locals }) => {
    const { scrim } = await parent();
    if (!scrim) error(404, '내전을 찾을 수 없습니다.');
    // 끝난 내전은 결과 화면에서 본다.
    if (hasResult(scrim.status)) redirect(307, bracketPath(params, scrim.status));
    try {
        if (!isDemo(params.guildId))
            return {
                scrim,
                bracket: await getBracket(getDb(), locals.actor, params.guildId, params.scrimId)
            };
        const version = await latestDataDragonVersion();
        return {
            scrim,
            bracket: await getMockBracket(params.guildId, params.scrimId, (id) =>
                championIconUrl(version, id)
            )
        };
    } catch (cause) {
        routeError(cause);
    }
};

function failWith(failure: MockFailure | null) {
    return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

export const actions: Actions = {
    place: async ({ request, params, locals, setHeaders }) => {
        const data = await request.formData();
        if (isDemo(params.guildId))
            return failWith(
                await placeMockBracketTeam(
                    params.guildId,
                    params.scrimId,
                    field(data, 'seat'),
                    field(data, 'teamId') || null
                )
            );
        try {
            await placeBracketTeam(getDb(), locals.actor, params.guildId, params.scrimId, {
                seat: field(data, 'seat'),
                teamId: field(data, 'teamId') || null,
                expectedRevision: Number(data.get('expectedRevision') ?? NaN)
            });
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    },
    bestOf: async ({ request, params, locals, setHeaders }) => {
        const data = await request.formData();
        if (isDemo(params.guildId))
            return failWith(
                await setMockBracketBestOf(
                    params.guildId,
                    params.scrimId,
                    field(data, 'stage'),
                    Number(field(data, 'bestOf'))
                )
            );
        try {
            await setBracketBestOf(getDb(), locals.actor, params.guildId, params.scrimId, {
                stage: field(data, 'stage'),
                bestOf: Number(data.get('bestOf')),
                expectedRevision: Number(data.get('expectedRevision') ?? NaN)
            });
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    },
    reset: async ({ params, locals, request, setHeaders }) => {
        if (isDemo(params.guildId)) return failWith(await resetMockBracket(params.guildId, params.scrimId));
        try {
            await resetBracket(getDb(), locals.actor, params.guildId, params.scrimId, {
                expectedRevision: Number((await request.formData()).get('expectedRevision') ?? NaN)
            });
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    },
    confirm: async ({ params, locals, request, setHeaders }) => {
        if (isDemo(params.guildId)) return failWith(await confirmMockBracket(params.guildId, params.scrimId));
        try {
            await confirmBracket(getDb(), locals.actor, params.guildId, params.scrimId, {
                expectedRevision: Number((await request.formData()).get('expectedRevision') ?? NaN)
            });
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    },
    unlock: async ({ params, locals, request, setHeaders }) => {
        if (isDemo(params.guildId)) return failWith(await unlockMockBracket(params.guildId, params.scrimId));
        try {
            await unlockBracket(getDb(), locals.actor, params.guildId, params.scrimId, {
                expectedRevision: Number((await request.formData()).get('expectedRevision') ?? NaN)
            });
        } catch (cause) {
            return actionFailure(cause, setHeaders);
        }
    }
};
