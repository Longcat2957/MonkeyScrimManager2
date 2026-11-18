import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, CARD_COLORS, label, preferredPositionLabel, publicationUrl, STATUSES } from './shared.js';

export function renderRecruitment(publication: BotPublication, origin: URL) {
    const data = publication.data;
    const date = data.scheduledAt ? `<t:${Math.floor(Date.parse(data.scheduledAt) / 1000)}:F>` : '일정 미정';
    const selected = data.participants.filter((player) => player.status === 'selected');
    const standby = data.participants.filter((player) => player.status === 'standby');
    const roster = (players: typeof selected) =>
        players.length
            ? players
                  .map(
                      (player, index) =>
                          `\`${String(index + 1).padStart(2, '0')}.\` **${label(player.name, 40)}** · ${preferredPositionLabel(player.positions) || '포지션 미정'}`
                  )
                  .join('\n')
            : '없음';
    const heading =
        `## ${label(data.title, 50)}\n${date}\n` +
        `**${STATUSES[data.status]}** · ${data.teamCount}팀${data.hardFearless ? ' · 하드 피어리스' : ''}`;
    const colors = {
        recruit: data.selected >= data.teamCount * 5 ? CARD_COLORS.success : CARD_COLORS.info,
        preparing: CARD_COLORS.warning,
        ready: CARD_COLORS.success,
        in_progress: CARD_COLORS.info,
        completed: CARD_COLORS.success,
        ended_early: CARD_COLORS.warning,
        cancelled: CARD_COLORS.error
    };
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`registration:${publication.scrimId}`)
            .setLabel('참가하기')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(data.status !== 'recruit'),
        new ButtonBuilder()
            .setCustomId(`registration-standby:${publication.scrimId}`)
            .setLabel('대기하기')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(data.status !== 'recruit'),
        new ButtonBuilder()
            .setCustomId(`registration-withdraw:${publication.scrimId}`)
            .setLabel('참가 취소')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(data.status !== 'recruit')
    );
    const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('웹에서 내전 보기')
            .setURL(publicationUrl(origin, publication))
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setCustomId(`manual-registration:open:${publication.scrimId}`)
            .setLabel('참가자 추가')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(data.status !== 'recruit')
    );
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [
            card(
                heading,
                `### 선발 ${data.selected}/${data.teamCount * 5}\n${roster(selected)}`,
                `### 대기 ${data.standby}명\n${roster(standby)}`
            ).setAccentColor(colors[data.status]),
            controls,
            navigation
        ],
        allowedMentions: { parse: [] as never[] }
    };
}
