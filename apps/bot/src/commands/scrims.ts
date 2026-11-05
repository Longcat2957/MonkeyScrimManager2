import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BotApi } from '../api/client.js';
import type { BotPublicationKind } from '../../../../shared/bot-api.js';
import { BotApiError } from '../api/client.js';
import { card, linkRow, notice, scrimUrl, webUrl } from '../messages/shared.js';

const PUBLICATION_LABELS: Record<BotPublicationKind, string> = {
    recruitment: '모집',
    entry: '팀 구성',
    lineup: '출전 명단',
    result: '경기 결과',
    confirmation_dm: '참가 안내 DM'
};

export function scheduleFromKst(value: string | null): string | null {
    if (!value?.trim()) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
    if (!match) throw new Error('예정 시각은 한국 시각으로 2026-11-05 20:00처럼 입력해 주세요.');
    const [, year, month, day, hour, minute] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
    if (
        !Number.isFinite(date.getTime()) ||
        new Date(date.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16) !==
            `${year}-${month}-${day}T${hour}:${minute}`
    ) {
        throw new Error('실제 달력에 있는 날짜를 입력해 주세요.');
    }
    return date.toISOString();
}

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
            components: [linkRow('내전 목록 열기', webUrl(origin, `/g/${guildId}/scrims`))]
        });
    } else if (interaction.commandName === '초기설정') {
        await api.initialize(guildId, actorId, interaction.id);
        await interaction.editReply({
            ...notice('서버 준비를 확인했어요. 서버 관리에서 계정과 게시 채널을 설정해 주세요.'),
            components: [
                card('서버 준비를 확인했어요. 서버 관리에서 계정과 게시 채널을 설정해 주세요.'),
                linkRow('서버 관리 열기', webUrl(origin, `/g/${guildId}/admin`))
            ]
        });
    } else if (interaction.commandName === '내전모집') {
        let scheduledAt: string | null;
        try {
            scheduledAt = scheduleFromKst(interaction.options.getString('예정시각'));
        } catch (error) {
            await interaction.editReply(
                notice(error instanceof Error ? error.message : '예정 시각을 확인해 주세요.')
            );
            return;
        }
        const result = await api.createScrim(guildId, {
            actorId,
            interactionId: interaction.id,
            title: interaction.options.getString('제목', true),
            scheduledAt,
            teamCount: interaction.options.getInteger('팀수') ?? 2,
            reserveCapacity: interaction.options.getInteger('대기정원') ?? 0,
            hardFearless: interaction.options.getBoolean('하드피어리스') ?? false
        });
        await interaction.editReply({
            ...notice('내전을 만들었어요.'),
            components: [
                card('내전을 만들었어요.'),
                linkRow('내전 열기', scrimUrl(origin, guildId, result.scrimId))
            ]
        });
    } else if (interaction.commandName === '게시복구') {
        const id = interaction.options.getString('작업', true);
        const messageId = interaction.options.getString('메시지')?.trim();
        if (messageId && !/^\d{17,20}$/.test(messageId)) {
            await interaction.editReply(notice('메시지 ID를 확인해 주세요.'));
            return;
        }
        await api.retryPublication(guildId, id, {
            actorId,
            interactionId: interaction.id,
            ...(messageId ? { messageId } : {}),
            confirmAbsent: interaction.options.getBoolean('글없음확인') ?? false
        });
        await interaction.editReply(notice('게시 작업을 다시 처리하도록 예약했어요.'));
    } else {
        await interaction.editReply(notice('현재 사용할 수 없는 명령이에요.'));
    }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction, api: BotApi) {
    if (!interaction.guildId || interaction.commandName !== '게시복구') {
        await interaction.respond([]);
        return;
    }
    const query = interaction.options.getFocused().toLocaleLowerCase();
    try {
        const { publications } = await api.failedPublications(interaction.guildId, interaction.user.id);
        await interaction.respond(
            publications
                .filter((item) => item.title.toLocaleLowerCase().includes(query))
                .slice(0, 25)
                .map((item) => ({
                    value: item.id,
                    name: `${PUBLICATION_LABELS[item.kind]} · ${item.title} · ${item.state === 'uncertain' ? '전달 불명' : '게시 실패'}`.slice(
                        0,
                        100
                    )
                }))
        );
    } catch (error) {
        // 자동완성은 별도 오류 메시지를 만들 수 없으며 실제 실행 시 다시 권한을 확인한다.
        if (error instanceof BotApiError) await interaction.respond([]);
        else throw error;
    }
}
