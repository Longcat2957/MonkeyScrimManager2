import { MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, CARD_COLORS, label, linkRow, POSITIONS, publicationUrl } from './shared.js';

export function renderEntry(publication: BotPublication, origin: URL) {
    const teams = publication.data.teams.map(
        (team) =>
            `### ${label(team.name)}\n` +
            team.players
                .map(
                    (player) =>
                        `${player.position ? POSITIONS[player.position] + ' · ' : ''}**${label(player.name, 40)}**`
                )
                .join('\n')
    );
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [
            card(`## ${label(publication.data.title, 50)}\n**팀 편성 확정**`, ...teams).setAccentColor(
                CARD_COLORS.success
            ),
            linkRow('웹에서 대진 보기', publicationUrl(origin, publication, '/bracket'))
        ],
        allowedMentions: { parse: [] as never[] }
    };
}
