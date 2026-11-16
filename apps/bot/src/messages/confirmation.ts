import { MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, CARD_COLORS, label, linkRow, publicationUrl } from './shared.js';

export function renderConfirmation(publication: BotPublication, origin: URL) {
    const scheduled = publication.data.scheduledAt
        ? `\n일정 · <t:${Math.floor(Date.parse(publication.data.scheduledAt) / 1000)}:F>`
        : '';
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [
            card(
                `## 참가가 확정됐어요\n**${label(publication.data.title, 50)}**${scheduled}`,
                '내전에서 팀 편성과 경기 정보를 확인하세요.'
            ).setAccentColor(CARD_COLORS.success),
            linkRow('웹에서 내전 보기', publicationUrl(origin, publication))
        ],
        allowedMentions: { parse: [] as never[] }
    };
}
