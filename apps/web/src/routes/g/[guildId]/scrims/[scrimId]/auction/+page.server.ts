import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { formationPath } from '#lib/features/scrims/paths.ts';
import type { MockFailure } from '#lib/mocks/scrims.ts';
import {
    assignMockCurrent,
    assignMockUnsold,
    awardMockLot,
    drawMockLot,
    getMockAuction,
    passMockLot,
    reopenMockAuctionSetup,
    resetMockAuction,
    restoreMockUnsold,
    revertMockLot,
    saveMockAuctionSetup,
    shuffleMockQueue,
    startMockAuction
} from '#lib/mocks/teams.ts';
import { clearMockFormationMethod } from '#lib/mocks/workflow.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { routeError } from '#lib/server/http.ts';
import { DomainError } from '#lib/server/errors.ts';
import {
    assignAuctionCurrent,
    assignAuctionUnsold,
    awardAuctionLot,
    drawAuctionLot,
    getAuction,
    passAuctionLot,
    reopenAuctionSetup,
    resetAuction,
    restoreAuctionUnsold,
    revertAuctionLot,
    saveAuctionSetup,
    shuffleAuctionQueue,
    startAuction
} from '#lib/server/scrims/auction.ts';
import { chooseFormationMethod } from '#lib/server/scrims/workflow.ts';
import type { Actions, PageServerLoad } from './$types';

const isDemo = (guildId: string) => dev && Boolean(findMockGuild(guildId));

function requireDev() {
    if (!dev) error(404, '내전을 찾을 수 없습니다.');
}

// 실제 편성 방식과 다른 경로로 들어오면 그 방식의 작업판으로, 방식이 아직 없으면 방식을 고르는 요약으로 보낸다.
export const load: PageServerLoad = async ({ parent, params, depends, locals }) => {
    const { scrim } = await parent();
    if (scrim && scrim.formationMethod !== 'auction') {
        redirect(
            307,
            formationPath(params, scrim.formationMethod) ?? resolve('/g/[guildId]/scrims/[scrimId]', params)
        );
    }
    if (!scrim) error(404, '내전을 찾을 수 없습니다.');
    depends('app:auction');
    // 모집이 끝나기 전에는 경매에 올릴 선발 인원이 확정되지 않았다.
    if (scrim.status === 'recruit') return { scrim, auction: null, can: { manage: false } };
    if (!isDemo(params.guildId)) {
        try {
            return {
                scrim,
                auction: await getAuction(getDb(), locals.actor, params.guildId, params.scrimId),
                can: { manage: scrim.canManage && scrim.status === 'preparing' }
            };
        } catch (cause) {
            routeError(cause);
        }
    }

    const version = await latestDataDragonVersion();
    const auction = await getMockAuction(
        params.guildId,
        params.scrimId,
        (id) => championIconUrl(version, id),
        await championResolver(version)
    );
    if (!auction) error(404, '내전을 찾을 수 없습니다.');
    return { scrim, auction, can: { manage: scrim.canManage } };
};

function failWith(failure: MockFailure | null) {
    return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

const previewActions: Actions = {
    setup: async ({ request, params }) => {
        requireDev();
        let teams: { captainId: string | null; startPoints: number }[];
        try {
            teams = JSON.parse(field(await request.formData(), 'teams'));
        } catch {
            return fail(400, { message: '설정을 다시 확인해 주세요' });
        }
        return failWith(await saveMockAuctionSetup(params.guildId, params.scrimId, teams));
    },
    start: async ({ params }) => {
        requireDev();
        return failWith(await startMockAuction(params.guildId, params.scrimId));
    },
    draw: async ({ params }) => {
        requireDev();
        return failWith(await drawMockLot(params.guildId, params.scrimId));
    },
    award: async ({ request, params }) => {
        requireDev();
        const data = await request.formData();
        return failWith(
            await awardMockLot(
                params.guildId,
                params.scrimId,
                field(data, 'teamId'),
                Number(field(data, 'price'))
            )
        );
    },
    pass: async ({ params }) => {
        requireDev();
        return failWith(await passMockLot(params.guildId, params.scrimId));
    },
    assign: async ({ request, params }) => {
        requireDev();
        const data = await request.formData();
        return failWith(
            await assignMockUnsold(
                params.guildId,
                params.scrimId,
                field(data, 'participantId'),
                field(data, 'teamId')
            )
        );
    },
    assignCurrent: async ({ request, params }) => {
        requireDev();
        return failWith(
            await assignMockCurrent(params.guildId, params.scrimId, field(await request.formData(), 'teamId'))
        );
    },
    shuffle: async ({ params }) => {
        requireDev();
        return failWith(await shuffleMockQueue(params.guildId, params.scrimId));
    },
    restore: async ({ request, params }) => {
        requireDev();
        return failWith(
            await restoreMockUnsold(
                params.guildId,
                params.scrimId,
                field(await request.formData(), 'participantId')
            )
        );
    },
    revert: async ({ params }) => {
        requireDev();
        return failWith(await revertMockLot(params.guildId, params.scrimId));
    },
    reset: async ({ params }) => {
        requireDev();
        return failWith(await resetMockAuction(params.guildId, params.scrimId));
    },
    reopenSetup: async ({ params }) => {
        requireDev();
        return failWith(await reopenMockAuctionSetup(params.guildId, params.scrimId));
    },

    // 방식 선택으로 되돌린다. 다시 불러오면 load가 공통 진입점으로 보낸다.
    changeMethod: async ({ params }) => {
        requireDev();
        return failWith(await clearMockFormationMethod(params.guildId, params.scrimId));
    }
};

type ActionEvent = Parameters<NonNullable<Actions[string]>>[0];

async function runAction(name: string, { request, params, locals, setHeaders }: ActionEvent) {
    try {
        const data = await request.formData();
        const input = { expectedRevision: Number(data.get('expectedRevision') ?? NaN) };
        const db = getDb();
        const actor = locals.actor;
        const { guildId, scrimId } = params;
        switch (name) {
            case 'setup': {
                let teams: unknown;
                try {
                    teams = JSON.parse(field(data, 'teams'));
                } catch {
                    throw new DomainError('INVALID_INPUT', '설정을 다시 확인해 주세요');
                }
                await saveAuctionSetup(db, actor, guildId, scrimId, { ...input, teams });
                break;
            }
            case 'start':
                await startAuction(db, actor, guildId, scrimId, input);
                break;
            case 'draw':
                await drawAuctionLot(db, actor, guildId, scrimId, input);
                break;
            case 'award':
                await awardAuctionLot(db, actor, guildId, scrimId, {
                    ...input,
                    lotId: field(data, 'lotId'),
                    teamId: field(data, 'teamId'),
                    price: Number(field(data, 'price').trim() || NaN)
                });
                break;
            case 'pass':
                await passAuctionLot(db, actor, guildId, scrimId, { ...input, lotId: field(data, 'lotId') });
                break;
            case 'assign':
                await assignAuctionUnsold(db, actor, guildId, scrimId, {
                    ...input,
                    participantId: field(data, 'participantId'),
                    teamId: field(data, 'teamId')
                });
                break;
            case 'assignCurrent':
                await assignAuctionCurrent(db, actor, guildId, scrimId, {
                    ...input,
                    lotId: field(data, 'lotId'),
                    teamId: field(data, 'teamId')
                });
                break;
            case 'shuffle':
                await shuffleAuctionQueue(db, actor, guildId, scrimId, input);
                break;
            case 'restore':
                await restoreAuctionUnsold(db, actor, guildId, scrimId, {
                    ...input,
                    participantId: field(data, 'participantId')
                });
                break;
            case 'revert':
                await revertAuctionLot(db, actor, guildId, scrimId, input);
                break;
            case 'reset':
                await resetAuction(db, actor, guildId, scrimId, input);
                break;
            case 'reopenSetup':
                await reopenAuctionSetup(db, actor, guildId, scrimId, input);
                break;
            case 'changeMethod':
                await chooseFormationMethod(db, actor, guildId, scrimId, { ...input, method: null });
                break;
        }
        return { saved: true };
    } catch (cause) {
        return actionFailure(cause, setHeaders);
    }
}

export const actions: Actions = Object.fromEntries(
    Object.entries(previewActions).map(([name, preview]) => [
        name,
        (event: ActionEvent) => (isDemo(event.params.guildId) ? preview(event) : runAction(name, event))
    ])
);
