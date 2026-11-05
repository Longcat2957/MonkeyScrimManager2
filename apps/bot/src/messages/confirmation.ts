import { MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, label, linkRow, scrimUrl } from './shared.js';

export function renderConfirmation(publication: BotPublication, origin: URL) {
    const url = new URL(scrimUrl(origin, publication.guildId, publication.scrimId));
    url.searchParams.set('publication', publication.id);
    const scheduled = publication.data.scheduledAt
        ? `\n일정 · <t:${Math.floor(Date.parse(publication.data.scheduledAt) / 1000)}:F>`
        : '';
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [
            card(
                `## 참가가 확정됐어요\n${label(publication.data.title, 50)}${scheduled}\n운영자가 참가 안내를 보냈어요. 내전에서 팀 편성과 경기 정보를 확인하세요.`
            ),
            linkRow('내전 열기', url.href)
        ],
        allowedMentions: { parse: [] as never[] }
    };
}
