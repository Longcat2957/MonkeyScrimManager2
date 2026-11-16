import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { BotApi } from '../api/client.js';
import { BotApiError } from '../api/client.js';
import { publicationChoiceName } from '../interactions/recovery.js';
import { card, linkRow, notice, webUrl } from '../messages/shared.js';
export { scheduleFromKst } from './schedule.js';

export async function handleCommand(interaction: ChatInputCommandInteraction, api: BotApi, origin: URL) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) {
        await interaction.editReply(notice('서버 안에서 명령을 사용해 주세요.'));
        return;
    }
    const guildId = interaction.guildId;
    const actorId = interaction.user.id;
    if (interaction.commandName === '내전목록') {
        await interaction.editReply({
            ...notice('이 서버의 내전 목록을 확인하세요.'),
            components: [linkRow('웹에서 내전 목록 보기', webUrl(origin, `/g/${guildId}/scrims`))]
        });
    } else if (interaction.commandName === '초기설정') {
        const result = await api.initialize(guildId, actorId, interaction.id);
        await interaction.editReply({
            flags: MessageFlags.IsComponentsV2,
            components: [
                card(
                    '## 서버 준비 완료',
                    `일반 멤버 **${result.membersSynced}명**을 등록·갱신했어요.`,
                    '게시 채널과 운영자 역할은 서버 관리에서 설정해 주세요.'
                ),
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('scrim-create:open')
                        .setLabel('내전 만들기')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setLabel('웹에서 서버 관리')
                        .setURL(webUrl(origin, `/g/${guildId}/admin`))
                        .setStyle(ButtonStyle.Link)
                )
            ],
            allowedMentions: { parse: [] }
        });
    } else {
        await interaction.editReply(notice('현재 사용할 수 없는 명령이에요.'));
    }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction, api: BotApi) {
    if (!interaction.guildId || !['게시복구', '시즌'].includes(interaction.commandName)) {
        await interaction.respond([]);
        return;
    }
    try {
        if (interaction.commandName === '시즌') {
            const focused = interaction.options.getFocused(true);
            if (focused.name !== '현재시즌') {
                await interaction.respond([]);
                return;
            }
            const query = String(focused.value).trim().toLocaleLowerCase();
            const { current } = await api.seasons(interaction.guildId, interaction.user.id, true);
            await interaction.respond(
                current && current.name.toLocaleLowerCase().includes(query)
                    ? [{ value: current.id, name: shorten(current.name.replace(/\s+/g, ' ').trim(), 100) }]
                    : []
            );
            return;
        }
        const query = interaction.options.getFocused();
        const { publications } = await api.failedPublications(
            interaction.guildId,
            interaction.user.id,
            query
        );
        await interaction.respond(
            publications.slice(0, 25).map((item) => ({ value: item.id, name: publicationChoiceName(item) }))
        );
    } catch (error) {
        // 자동완성은 별도 오류 메시지를 만들 수 없으며 실제 실행 시 다시 권한을 확인한다.
        if (error instanceof BotApiError) await interaction.respond([]);
        else throw error;
    }
}

function shorten(value: string, limit: number) {
    if (value.length <= limit) return value;
    let result = '';
    // 이모지의 서로게이트 쌍을 자르지 않으면서 Discord의 100자 제한 안에 둔다.
    for (const character of value) {
        if (result.length + character.length > limit - 1) break;
        result += character;
    }
    return result + '…';
}
