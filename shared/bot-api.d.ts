/** 웹 내부 API와 봇이 공유하는 JSON 계약이다. 런타임 업무 코드는 웹 서버에 둔다. */
export type BotPosition = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
export type BotScrimStatus =
    'recruit' | 'preparing' | 'ready' | 'in_progress' | 'completed' | 'ended_early' | 'cancelled';

export interface BotRegistrationContext {
    guildId: string;
    scrimId: string;
    title: string;
    status: BotScrimStatus;
    canEdit: boolean;
    reason: string | null;
    accounts: { id: string; label: string; isPrimary: boolean }[];
    registration: {
        id: string;
        status: 'selected' | 'standby' | 'withdrawn' | 'excluded';
        riotAccountId: string | null;
        positions: BotPosition[];
    } | null;
}

export interface BotRegistrationInput {
    actorId: string;
    interactionId: string;
    action: 'create' | 'update' | 'withdraw';
    registrationId?: string;
    riotAccountId?: string;
    positions?: BotPosition[];
}

export interface BotPublicationData {
    title: string;
    status: BotScrimStatus;
    scheduledAt: string | null;
    teamCount: number;
    formationMethod: 'manual' | 'auction' | null;
    hardFearless: boolean;
    selected: number;
    standby: number;
    capacity: number;
    participants: { name: string; status: 'selected' | 'standby'; positions: BotPosition[] }[];
    teams: { name: string; players: { name: string; position: BotPosition | null }[] }[];
}

export interface BotPublication {
    id: string;
    guildId: string;
    scrimId: string;
    kind: 'recruitment' | 'entry';
    revision: number;
    leaseToken: string;
    operation: 'upsert' | 'delete';
    channelId: string;
    messageId: string | null;
    nonce: string;
    data: BotPublicationData;
}

export interface BotPublicationResult {
    leaseToken: string;
    revision: number;
    outcome: 'sent' | 'retry' | 'blocked' | 'uncertain';
    messageId?: string;
    errorCode?: string;
    retryAfterSeconds?: number;
}

export interface BotCreateScrimInput {
    actorId: string;
    interactionId: string;
    title: string;
    scheduledAt: string | null;
    teamCount: number;
    reserveCapacity: number;
    hardFearless: boolean;
}

export interface BotGuildSyncInput {
    state: 'available' | 'removed' | 'unavailable';
    memberId?: string;
    memberRemoved?: boolean;
}

export interface BotApiErrorBody {
    error: { code: string; message: string };
}

export interface BotFailedPublication {
    id: string;
    scrimId: string;
    title: string;
    kind: 'recruitment' | 'entry';
    state: 'blocked' | 'uncertain';
    channelId: string | null;
    messageId: string | null;
    errorCode: string | null;
}

export interface BotPublicationRetryInput {
    actorId: string;
    interactionId: string;
    messageId?: string;
    confirmAbsent?: boolean;
}
