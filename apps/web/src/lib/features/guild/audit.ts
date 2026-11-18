import type { GuildDiscordSettingKey } from './types.ts';

export const guildAuditKinds = [
    'riot_account_linked',
    'riot_account_unlinked',
    'riot_account_primary_changed',
    'discord_setting_changed'
] as const;
export type GuildAuditKind = (typeof guildAuditKinds)[number];

export type GuildAuditIdentity = { userId: string | null; displayName: string };
export type GuildAuditPrimary = { id: string | null; riotId: string | null };

export type GuildAuditEntry = {
    id: string;
    occurredAt: string;
    kind: GuildAuditKind;
    actor: GuildAuditIdentity;
    target: GuildAuditIdentity | null;
    account: { id: string | null; gameName: string | null; tagLine: string | null } | null;
    primary: { before: GuildAuditPrimary | null; after: GuildAuditPrimary | null } | null;
    setting: {
        key: GuildDiscordSettingKey;
        before: { id: string | null; name: string | null } | null;
        after: { id: string | null; name: string | null } | null;
    } | null;
};

export type GuildAuditPage = { entries: GuildAuditEntry[]; total: number };
