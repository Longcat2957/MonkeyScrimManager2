import { randomBytes } from 'node:crypto';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { BotApiError, type BotApi } from '../api/client.js';
import { scheduleFromKst } from '../commands/schedule.js';
import { card, label, linkRow, notice, scrimUrl } from '../messages/shared.js';

interface CreationDraft {
    title: string;
    scheduledAt: string;
    teamCount: string;
    reserveCapacity: string;
    hardFearless: string;
}

export interface ScrimCreationForm {
    id: string;
    actorId: string;
    guildId: string;
    interactionId: string;
    expiresAt: number;
    draft: CreationDraft;
    busy: boolean;
    scrimId: string | null;
}

export class ScrimCreationForms {
    private readonly forms = new Map<string, ScrimCreationForm>();
    constructor(
        private readonly now: () => number = Date.now,
        private readonly maximum = 1000
    ) {}

    create(actorId: string, guildId: string, interactionId: string): ScrimCreationForm {
        for (const [id, form] of this.forms) if (form.expiresAt <= this.now()) this.forms.delete(id);
        if (this.forms.size >= this.maximum) this.forms.delete(this.forms.keys().next().value!);
        const form: ScrimCreationForm = {
            id: randomBytes(12).toString('hex'),
            actorId,
            guildId,
            interactionId,
            expiresAt: this.now() + 10 * 60_000,
            draft: {
                title: '',
                scheduledAt: '',
                teamCount: '2',
                reserveCapacity: '0',
                hardFearless: 'false'
            },
            busy: false,
            scrimId: null
        };
        this.forms.set(form.id, form);
        return form;
    }

    get(id: string, actorId: string, guildId: string | null): ScrimCreationForm | null {
        const form = this.forms.get(id);
        if (!form) return null;
        if (form.expiresAt <= this.now()) {
            this.forms.delete(id);
            return null;
        }
        return form.actorId === actorId && form.guildId === guildId ? form : null;
    }
}

function choice(id: string, title: string, current: string, options: { label: string; value: string }[]) {
    return new LabelBuilder().setLabel(title).setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
            .setCustomId(id)
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options.map((option) => ({ ...option, default: option.value === current })))
    );
}

const creationTeamCounts = ['2', '4'];

export function creationModal(form: ScrimCreationForm) {
    const title = new TextInputBuilder()
        .setCustomId('title')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(50)
        .setPlaceholder('예: 금요일 저녁 내전');
    if (form.draft.title) title.setValue(form.draft.title.slice(0, 50));
    const scheduledAt = new TextInputBuilder()
        .setCustomId('scheduledAt')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(16)
        .setPlaceholder('YYYY-MM-DD HH:mm');
    if (form.draft.scheduledAt) scheduledAt.setValue(form.draft.scheduledAt.slice(0, 16));
    return new ModalBuilder()
        .setCustomId('scrim-create:' + form.id)
        .setTitle('내전 모집 만들기')
        .addLabelComponents(
            new LabelBuilder().setLabel('내전 제목').setTextInputComponent(title),
            new LabelBuilder()
                .setLabel('예정 시각')
                .setDescription('한국 시각으로 입력해 주세요. 비워두면 일정 미정입니다.')
                .setTextInputComponent(scheduledAt),
            choice(
                'teamCount',
                '팀 수',
                form.draft.teamCount,
                creationTeamCounts.map((count) => ({
                    label: `${count}팀 · ${Number(count) * 5}명`,
                    value: count
                }))
            ),
            choice(
                'reserveCapacity',
                '추가 대기 인원',
                form.draft.reserveCapacity,
                Array.from({ length: 11 }, (_, count) => ({
                    label: count === 0 ? '대기 없음' : `${count}명`,
                    value: String(count)
                }))
            ),
            choice('hardFearless', '하드 피어리스', form.draft.hardFearless, [
                { label: '사용 안 함', value: 'false' },
                { label: '사용', value: 'true' }
            ])
        );
}

const expired = () => notice('작성 화면이 만료됐어요. /내전모집으로 다시 열어 주세요.');

export async function openScrimCreation(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    forms: ScrimCreationForms
) {
    if (!interaction.guildId) {
        await interaction.reply({
            ...notice('서버 안에서 명령을 사용해 주세요.'),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    const form = forms.create(interaction.user.id, interaction.guildId, interaction.id);
    await interaction.showModal(creationModal(form));
}

export async function reopenScrimCreation(interaction: ButtonInteraction, forms: ScrimCreationForms) {
    const id = /^scrim-create:edit:([a-f0-9]{24})$/.exec(interaction.customId)?.[1];
    const form = id ? forms.get(id, interaction.user.id, interaction.guildId) : null;
    if (!form || form.scrimId || form.busy) {
        await interaction.reply({
            ...expired(),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    await interaction.showModal(creationModal(form));
}

class CreationInputError extends Error {}

function creationInput(form: ScrimCreationForm) {
    const title = form.draft.title.trim();
    if (!title || title.length > 50) throw new CreationInputError('내전 제목은 1~50자로 입력해 주세요.');
    if (
        !creationTeamCounts.includes(form.draft.teamCount) ||
        !/^(?:[0-9]|10)$/.test(form.draft.reserveCapacity) ||
        !['true', 'false'].includes(form.draft.hardFearless)
    ) {
        throw new CreationInputError('팀 수·대기 인원·하드 피어리스 선택을 확인해 주세요.');
    }
    let scheduledAt: string | null;
    try {
        scheduledAt = scheduleFromKst(form.draft.scheduledAt);
    } catch (cause) {
        throw new CreationInputError(cause instanceof Error ? cause.message : '예정 시각을 확인해 주세요.');
    }
    return {
        title,
        scheduledAt,
        teamCount: Number(form.draft.teamCount),
        reserveCapacity: Number(form.draft.reserveCapacity),
        hardFearless: form.draft.hardFearless === 'true'
    };
}

function createdReply(form: ScrimCreationForm, origin: URL) {
    return {
        ...notice(`**${label(form.draft.title, 50)}** 내전을 만들었어요.`),
        components: [
            card(`**${label(form.draft.title, 50)}** 내전을 만들었어요.`),
            linkRow('웹에서 내전 보기', scrimUrl(origin, form.guildId, form.scrimId!))
        ]
    };
}

export async function submitScrimCreation(
    interaction: ModalSubmitInteraction,
    api: BotApi,
    origin: URL,
    forms: ScrimCreationForms
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = /^scrim-create:([a-f0-9]{24})$/.exec(interaction.customId)?.[1];
    const form = id ? forms.get(id, interaction.user.id, interaction.guildId) : null;
    if (!form) {
        await interaction.editReply(expired());
        return;
    }
    if (form.scrimId) {
        await interaction.editReply(createdReply(form, origin));
        return;
    }
    if (form.busy) {
        await interaction.editReply(notice('이 내전을 만들고 있어요. 잠시만 기다려 주세요.'));
        return;
    }
    form.busy = true;
    try {
        form.draft = {
            title: interaction.fields.getTextInputValue('title'),
            scheduledAt: interaction.fields.getTextInputValue('scheduledAt'),
            teamCount: interaction.fields.getStringSelectValues('teamCount')[0] ?? '',
            reserveCapacity: interaction.fields.getStringSelectValues('reserveCapacity')[0] ?? '',
            hardFearless: interaction.fields.getStringSelectValues('hardFearless')[0] ?? ''
        };
        const input = creationInput(form);
        // 입력 수정이나 응답 유실 뒤에도 최초 명령의 멱등 키로 같은 내전을 다시 만들지 않는다.
        const result = await api.createScrim(form.guildId, {
            ...input,
            actorId: form.actorId,
            interactionId: form.interactionId
        });
        form.scrimId = result.scrimId;
        await interaction.editReply(createdReply(form, origin));
    } catch (error) {
        if (!(error instanceof CreationInputError) && !(error instanceof BotApiError)) throw error;
        await interaction.editReply({
            ...notice(error.message),
            components: [
                card(error.message),
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('scrim-create:edit:' + form.id)
                        .setLabel('입력 수정')
                        .setStyle(ButtonStyle.Primary)
                )
            ]
        });
    } finally {
        form.busy = false;
    }
}
