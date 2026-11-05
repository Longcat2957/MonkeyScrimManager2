import type { BotPublication, BotRegistrationContext } from '../../../shared/bot-api.js';

export const GUILD = '970000000000000001';
export const USER = '970000000000000011';
export const SCRIM = '10000000-0000-4000-8000-000000000001';
export const ACCOUNT = '20000000-0000-4000-8000-000000000001';
export const REGISTRATION = '30000000-0000-4000-8000-000000000001';

export function registrationContext(patch: Partial<BotRegistrationContext> = {}): BotRegistrationContext {
    return {
        guildId: GUILD,
        scrimId: SCRIM,
        title: '금요일 내전',
        status: 'recruit',
        canEdit: true,
        reason: null,
        accounts: [{ id: ACCOUNT, label: 'Player#KR1', isPrimary: true }],
        registration: null,
        ...patch
    };
}

export function publication(patch: Partial<BotPublication> = {}): BotPublication {
    return {
        id: '40000000-0000-4000-8000-000000000001',
        guildId: GUILD,
        scrimId: SCRIM,
        kind: 'recruitment',
        subjectId: 'scrim',
        recipientId: null,
        revision: 2,
        leaseToken: '50000000-0000-4000-8000-000000000001',
        operation: 'upsert',
        channelId: '970000000000000090',
        messageId: null,
        nonce: 'fixture-nonce',
        data: {
            title: '금요일 내전',
            status: 'recruit',
            scheduledAt: '2026-11-05T11:00:00Z',
            teamCount: 2,
            formationMethod: null,
            hardFearless: false,
            selected: 0,
            standby: 0,
            capacity: 12,
            participants: [],
            teams: []
        },
        ...patch
    };
}
