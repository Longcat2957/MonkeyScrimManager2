import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { getMockMatch, recordMockGame, type RawGame } from '#lib/mocks/matches.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getMatch } from '#lib/server/matches/queries.ts';
import { getMatchOperationContext } from '#lib/server/matches/operation-context.ts';
import {
    confirmMatchLineup,
    releaseMatchLineup,
    importMatchRofl,
    revertLastMatchGame
} from '#lib/server/matches/service.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { DomainError } from '#lib/server/errors.ts';
import { RiotError } from '#lib/server/riot/errors.ts';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { routeError } from '#lib/server/http.ts';
import { dataDragonSplashUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { loadoutResolver } from '#lib/server/ddragon/loadout.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { RoflError } from '#lib/server/rofl/format.ts';
import { projectRoflGame } from '#lib/server/rofl/projection.ts';
import type { Actions, PageServerLoad } from './$types';

// 실제 경기 파일은 수십 MB 안쪽이다. 이보다 크면 읽기 전에 거절한다.
const MAX_ROFL_BYTES = 64 * 1024 * 1024;

export const load: PageServerLoad = async ({ params, url, locals }) => {
    const version = await latestDataDragonVersion();
    const [champion, loadout] = await Promise.all([championResolver(version), loadoutResolver(version)]);
    const resolvers = {
        champion,
        ...loadout,
        splash: (championId: string) => (version && championId ? dataDragonSplashUrl(championId) : null)
    };
    try {
        const result =
            dev && findMockGuild(params.guildId)
                ? await getMockMatch(params.guildId, params.matchId, url.searchParams.get('game'), resolvers)
                : await getMatch(
                      getDb(),
                      locals.actor,
                      params.guildId,
                      params.matchId,
                      url.searchParams.get('game'),
                      resolvers
                  );
        if (!result) error(404, '경기를 찾을 수 없습니다.');
        if (dev && findMockGuild(params.guildId)) return { ...result, operation: null };
        const operation = await getMatchOperationContext(
            getDb(),
            locals.actor,
            params.guildId,
            params.matchId
        );
        return { ...result, operation, can: { upload: operation.can.upload } };
    } catch (cause) {
        routeError(cause);
    }
};

function toRawGame(bytes: Uint8Array): RawGame | string {
    try {
        const projection = projectRoflGame(bytes);
        if (projection.result.status !== 'consistent') return '결과를 확인할 수 없어 기록하지 않았어요';
        return {
            gameVersion: projection.gameVersion,
            gameLengthMs: projection.gameLengthMs,
            participants: projection.participants.map((player) => ({
                riotId: player.riotId,
                champion: player.champion,
                teamId: player.teamId,
                win: player.win,
                stats: player.stats,
                loadout: { ...player.loadout, keystoneId: player.loadout.runeIds[0] ?? null }
            }))
        };
    } catch (cause) {
        if (cause instanceof RoflError) return '읽을 수 없는 ROFL 파일이에요';
        throw cause;
    }
}

type ActionEvent = Parameters<NonNullable<Actions[string]>>[0];

function integer(data: FormData, name: string) {
    const value = data.get(name);
    return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
}

async function changeLineup(name: 'confirmLineup' | 'releaseLineup' | 'revertResult', event: ActionEvent) {
    const { request, params, locals, setHeaders } = event;
    try {
        requireUser(locals.actor);
        const data = await request.formData();
        const input = {
            expectedRevision: integer(data, 'expectedRevision')
        };
        const db = getDb();
        if (name === 'confirmLineup') {
            let players: { participantId: string; position: LolPosition }[];
            try {
                players = JSON.parse(String(data.get('players') ?? ''));
                if (!Array.isArray(players)) throw new Error();
            } catch {
                throw new DomainError('INVALID_INPUT', '출전 선수를 다시 확인해 주세요');
            }
            await confirmMatchLineup(db, locals.actor, params.guildId, params.matchId, {
                ...input,
                players
            });
        } else if (name === 'releaseLineup') {
            await releaseMatchLineup(db, locals.actor, params.guildId, params.matchId, {
                ...input,
                lineupId: String(data.get('lineupId') ?? '')
            });
        } else {
            await revertLastMatchGame(db, locals.actor, params.guildId, params.matchId, {
                expectedRevision: input.expectedRevision,
                gameId: String(data.get('gameId') ?? ''),
                reason: '운영자가 마지막 세트 결과를 취소함'
            });
        }
        return { saved: true };
    } catch (cause) {
        return actionFailure(cause, setHeaders);
    }
}

export const actions: Actions = {
    confirmLineup: (event) => changeLineup('confirmLineup', event),
    releaseLineup: (event) => changeLineup('releaseLineup', event),
    revertResult: (event) => changeLineup('revertResult', event),
    upload: async ({ request, params, locals, setHeaders }) => {
        if (!(dev && findMockGuild(params.guildId))) {
            try {
                requireUser(locals.actor);
                const data = await request.formData();
                const file = data.get('file');
                if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.rofl'))
                    return fail(400, { message: 'ROFL 파일을 골라 주세요' });
                if (file.size > MAX_ROFL_BYTES) return fail(413, { message: '파일이 너무 커요' });
                return await importMatchRofl(getDb(), locals.actor, params.guildId, params.matchId, {
                    expectedRevision: integer(data, 'expectedRevision'),
                    nextGameNumber: integer(data, 'expectedGameNumber'),
                    lineupId: String(data.get('lineupId') ?? ''),
                    blueTeamSlot: String(data.get('blueTeamSlot') ?? '') as 'a' | 'b',
                    bytes: new Uint8Array(await file.arrayBuffer())
                });
            } catch (cause) {
                if (cause instanceof RoflError) return fail(422, { message: '읽을 수 없는 ROFL 파일이에요' });
                if (cause instanceof RiotError) {
                    if (cause.retryAfterSeconds)
                        setHeaders({ 'Retry-After': String(cause.retryAfterSeconds) });
                    return fail(cause.status, {
                        message: 'Riot 계정 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요'
                    });
                }
                return actionFailure(cause, setHeaders);
            }
        }
        const file = (await request.formData()).get('file');
        if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.rofl'))
            return fail(400, { message: 'ROFL 파일을 골라 주세요' });
        if (file.size > MAX_ROFL_BYTES) return fail(413, { message: '파일이 너무 커요' });
        const raw = toRawGame(new Uint8Array(await file.arrayBuffer()));
        if (typeof raw === 'string') return fail(422, { message: raw });
        // 명시적 개발 샘플은 운영 DB와 분리된 메모리 예시만 변경한다.
        const result = await recordMockGame(params.guildId, params.matchId, raw);
        if ('status' in result) return fail(result.status, { message: result.message });
        return { order: result.order };
    }
};
