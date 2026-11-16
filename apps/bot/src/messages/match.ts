import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, CARD_COLORS, label, POSITIONS, publicationUrl, webUrl } from './shared.js';

export function renderMatch(publication: BotPublication, origin: URL) {
    const match = publication.data.match;
    if (!match || !['lineup', 'result'].includes(publication.kind))
        throw new Error('INVALID_MATCH_PUBLICATION');
    const result = publication.kind === 'result';
    if (
        result &&
        (!match.winnerSide || !match.blueTeamName || !match.redTeamName || match.gameNumber === null)
    )
        throw new Error('INVALID_RESULT_PUBLICATION');
    const positions = Object.keys(POSITIONS);
    const rosters = (result ? (['blue', 'red'] as const) : (['a', 'b'] as const)).map((side) => {
        const team =
            side === 'blue'
                ? match.blueTeamName
                : side === 'red'
                  ? match.redTeamName
                  : side === 'a'
                    ? match.teamAName
                    : match.teamBName;
        const players = match.players
            .filter((player) => (result ? player.side === side : player.teamSlot === side))
            .sort((a, b) => positions.indexOf(a.position ?? '') - positions.indexOf(b.position ?? ''));
        return (
            `### ${result ? (side === 'blue' ? '블루' : '레드') + ' · ' : ''}${label(team ?? '팀', 30)}\n` +
            players
                .map((player) => {
                    const kda = [player.kills, player.deaths, player.assists]
                        .map((value) => value ?? '—')
                        .join('/');
                    return (
                        `${player.position ? POSITIONS[player.position] + ' · ' : ''}**${label(player.name, 32)}**` +
                        (result
                            ? ` · ${player.champion ? label(player.champion, 20) : '챔피언 미확인'} · ${kda}`
                            : '')
                    );
                })
                .join('\n')
        );
    });
    const winner = match.winnerSide === 'blue' ? match.blueTeamName : match.redTeamName;
    const summary = result
        ? `### ${label(winner ?? '팀', 30)} 승리\n시리즈 ${label(match.teamAName, 30)} ${match.scoreA} : ${match.scoreB} ${label(match.teamBName, 30)}` +
          (match.seriesWinnerName ? `\n시리즈 승자 · ${label(match.seriesWinnerName, 30)}` : '')
        : '확정 출전 명단';
    const heading = `## ${label(publication.data.title, 50)}\n${label(match.label, 40)}${result ? ` · ${match.gameNumber}세트` : ''} · BO${match.bestOf}`;
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [
            card(
                result ? heading : `${heading}\n**${summary}**`,
                ...(result ? [summary] : []),
                ...rosters
            ).setAccentColor(result ? CARD_COLORS.success : CARD_COLORS.info),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('웹에서 경기 보기')
                    .setURL(webUrl(origin, `/g/${publication.guildId}/matches/${match.id}`)),
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('웹에서 내전 보기')
                    .setURL(publicationUrl(origin, publication))
            )
        ],
        allowedMentions: { parse: [] as never[] }
    };
}
