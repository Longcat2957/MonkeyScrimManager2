import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { BotPublication } from '../../../../shared/bot-api.js';
import { card, label, POSITIONS, publicationUrl, STATUSES } from './shared.js';

export function renderRecruitment(publication: BotPublication, origin: URL) {
    const data = publication.data;
    const date = data.scheduledAt ? `<t:${Math.floor(Date.parse(data.scheduledAt) / 1000)}:F>` : '일정 미정';
    const selected = data.participants.filter((player) => player.status === 'selected');
    const standby = data.participants.filter((player) => player.status === 'standby');
    const roster = (players: typeof selected) =>
        players.length
            ? players
                  .map(
                      (player) =>
                          `${label(player.name, 40)} · ${player.positions.map((position) => POSITIONS[position]).join(' / ') || '포지션 미정'}`
                  )
                  .join('\n')
            : '없음';
    const text =
        `## ${label(data.title, 50)}\n${date}\n${STATUSES[data.status]} · ${data.teamCount}팀${data.formationMethod ? ' · ' + (data.formationMethod === 'manual' ? '수동 편성' : '경매') : ''}${data.hardFearless ? ' · 하드 피어리스' : ''}\n\n` +
        `### 선발 ${data.selected}/${data.teamCount * 5}\n${roster(selected)}\n\n### 대기 ${data.standby}/${data.capacity - data.teamCount * 5}\n${roster(standby)}`;
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`registration:${publication.scrimId}`)
            .setLabel('내 신청')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel('내전 열기')
            .setURL(publicationUrl(origin, publication))
            .setStyle(ButtonStyle.Link)
    );
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [card(text), controls],
        allowedMentions: { parse: [] as never[] }
    };
}
