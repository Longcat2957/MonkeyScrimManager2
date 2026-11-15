import type { BotRotateSeasonInput, BotSeasonSnapshot } from '../../../../../../shared/bot-api.js';
import type { Database } from '../db/types.ts';
import { DomainError } from '../errors.ts';
import { requireGuildAdmin } from '../guild/access.ts';
import {
    getGuildSeasons,
    rotateGuildSeasonInTransaction,
    validateRotateGuildSeasonInput
} from '../guild/seasons.ts';
import type { ScrimAccessDependencies } from '../scrims/service.ts';
import { botActor } from './bot-service.ts';
import { withBotReceipt } from './bot-receipts.ts';
import { isDiscordId } from './client.ts';

function validateGuild(guildId: string) {
    if (!isDiscordId(guildId)) throw new DomainError('INVALID_INPUT', '서버 식별자가 올바르지 않아요');
}

/** 관리자용 /시즌 명령이 소비하는 현재·과거 시즌 조회다. 공개 전적 조회 계약은 바꾸지 않는다. */
export async function getBotSeasons(
    db: Database,
    guildId: string,
    actorId: string,
    access?: ScrimAccessDependencies
): Promise<BotSeasonSnapshot> {
    validateGuild(guildId);
    return getGuildSeasons(db, botActor(actorId), guildId, access);
}

/** MSM1처럼 이전 시즌 종료와 다음 시즌 생성을 함께 커밋하고 기존 내전의 시즌·점수는 유지한다. */
export async function rotateBotSeason(
    db: Database,
    guildId: string,
    input: BotRotateSeasonInput,
    access?: ScrimAccessDependencies
): Promise<BotSeasonSnapshot> {
    validateGuild(guildId);
    const actor = botActor(input.actorId);
    const validated = validateRotateGuildSeasonInput(input);
    await requireGuildAdmin(actor, guildId, { ...access, db });
    return db.transaction((tx) =>
        withBotReceipt(
            tx,
            {
                ...input,
                guildId,
                operation: 'rotate-season',
                payload: {
                    name: validated.name,
                    expectedCurrentSeasonId: input.expectedCurrentSeasonId,
                    confirm: true
                }
            },
            // 요청 receipt는 실행자·이전/다음 시즌 결과를 기존 계약 그대로 같은 트랜잭션에 보존한다.
            () => rotateGuildSeasonInTransaction(tx, actor, guildId, validated)
        )
    );
}
