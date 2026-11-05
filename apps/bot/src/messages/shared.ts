import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    TextDisplayBuilder,
    escapeMarkdown
} from 'discord.js';
import type { BotPosition, BotScrimStatus } from '../../../../shared/bot-api.js';

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

export function card(text: string) {
    return new ContainerBuilder()
        .setAccentColor(0x22d3ee)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
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
