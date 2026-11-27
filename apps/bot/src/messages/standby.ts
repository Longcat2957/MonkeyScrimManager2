import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    LabelBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { formatKstMinute } from '../commands/schedule.js';
import { notice } from './shared.js';

export function standbyButton(scrimId: string, scheduledAt: string | null) {
    return new ButtonBuilder()
        .setCustomId(`registration-standby:${scrimId}:${scheduledAt ? Date.parse(scheduledAt) : 'unset'}`)
        .setLabel('대기 신청 / 시각 변경')
        .setStyle(ButtonStyle.Secondary);
}

export function standbyPrompt(message: string, scrimId: string, scheduledAt: string | null) {
    if (!scheduledAt) return notice('예정 시작 시각이 정해지면 대기를 신청할 수 있어요.');
    const prompt = notice(message);
    return {
        ...prompt,
        components: [
            ...prompt.components,
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                standbyButton(scrimId, scheduledAt).setLabel('합류 시각 입력')
            )
        ]
    };
}

export function standbyModal(scrimId: string, start: number, pressedAt: number) {
    return new ModalBuilder()
        .setCustomId(`standby-time:${scrimId}:${start}`)
        .setTitle('대기 신청 / 시각 변경')
        .addLabelComponents(
            new LabelBuilder()
                .setLabel('합류 가능 시각 (한국 시간)')
                .setDescription(
                    `지금과 예정 시작(${formatKstMinute(start)})보다 늦은 시각으로 바꿔 주세요. 대기 명단에서 기다리다가 모집 중 합류 시각부터 선발 자리가 비면 자동으로 이동해요.`
                )
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('availableAt')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(16)
                        .setPlaceholder('YYYY-MM-DD HH:mm')
                        .setValue(formatKstMinute(pressedAt))
                )
        );
}
