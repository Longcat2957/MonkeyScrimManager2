import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    escapeMarkdown
} from 'discord.js';
import type { BotPosition, BotPublication, BotScrimStatus } from '../../../../shared/bot-api.js';

export const POSITIONS: Record<BotPosition, string> = {
    top: '탑',
    jungle: '정글',
    mid: '미드',
    bot: '원딜',
    support: '서포터'
};
export const STATUSES: Record<BotScrimStatus, string> = {
    recruit: '모집 중',
    preparing: '팀 편성 중',
    ready: '대진 준비',
    in_progress: '진행 중',
    completed: '종료',
    ended_early: '중도 종료',
    cancelled: '취소'
};
export const CARD_COLORS = {
    info: 0x22d3ee,
    success: 0x34d399,
    warning: 0xfbbf24,
    error: 0xf87171
} as const;

export function preferredPositionLabel(positions: readonly BotPosition[]): string {
    return positions.length === 5
        ? '포지션 무관'
        : positions.map((position) => POSITIONS[position]).join(' / ');
}

export function label(value: string, maximum = 80): string {
    const text = value.replace(/\s+/g, ' ').trim();
    return escapeMarkdown([...text].slice(0, maximum).join(''));
}

export function webUrl(origin: URL, path: string): string {
    return new URL(path, origin).href;
}

export function scrimUrl(origin: URL, guildId: string, scrimId: string): string {
    return webUrl(origin, `/g/${encodeURIComponent(guildId)}/scrims/${encodeURIComponent(scrimId)}`);
}

export function publicationUrl(origin: URL, publication: BotPublication, suffix = ''): string {
    const url = new URL(scrimUrl(origin, publication.guildId, publication.scrimId) + suffix);
    url.searchParams.set('publication', publication.id);
    return url.href;
}

export function card(text: string, ...sections: string[]) {
    const container = new ContainerBuilder()
        .setAccentColor(CARD_COLORS.info)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    for (const section of sections) {
        if (!section.trim()) continue;
        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(section));
    }
    return container;
}

export function linkRow(title: string, url: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(title).setURL(url)
    );
}

export function notice(text: string) {
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components: [card(text)],
        allowedMentions: { parse: [] as never[] }
    };
}
