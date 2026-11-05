import { MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, label, linkRow, POSITIONS, publicationUrl } from './shared.js';

export function renderEntry(publication: BotPublication, origin: URL) {
    const teams = publication.data.teams
        .map(
            (team) =>
                `### ${label(team.name)}\n` +
                team.players
                    .map(
                        (player) =>
                            `${player.position ? POSITIONS[player.position] + ' · ' : ''}${label(player.name, 40)}`
                    )
                    .join('\n')
        )
        .join('\n\n');
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [
            card(`## ${label(publication.data.title, 50)}\n팀 편성이 확정됐어요.\n\n${teams}`),
            linkRow('대진 열기', publicationUrl(origin, publication, '/bracket'))
        ],
        allowedMentions: { parse: [] as never[] }
    };
}
