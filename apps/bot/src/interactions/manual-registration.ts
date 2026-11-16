import { randomBytes } from 'node:crypto';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    UserSelectMenuBuilder
} from 'discord.js';
import type { ButtonInteraction, UserSelectMenuInteraction } from 'discord.js';
import type { BotManualRegistrationContext, BotManualRegistrationInput } from '../../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../api/client.js';
import { card, label, notice } from '../messages/shared.js';

interface ManualRegistrationForm {
    id: string;
    actorId: string;
    guildId: string;
    context: BotManualRegistrationContext;
    expiresAt: number;
    busy: boolean;
    feedback: string | null;
    pending: BotManualRegistrationInput | null;
}

export class ManualRegistrationForms {
    private readonly forms = new Map<string, ManualRegistrationForm>();
    constructor(
        private readonly now: () => number = Date.now,
        private readonly maximum = 1000
    ) {}

    create(actorId: string, guildId: string, context: BotManualRegistrationContext): ManualRegistrationForm {
        for (const [id, form] of this.forms) if (form.expiresAt <= this.now()) this.forms.delete(id);
        if (this.forms.size >= this.maximum) this.forms.delete(this.forms.keys().next().value!);
        const form: ManualRegistrationForm = {
            id: randomBytes(12).toString('hex'),
            actorId,
            guildId,
            context,
            expiresAt: this.now() + 10 * 60_000,
            busy: false,
            feedback: null,
            pending: null
        };
        this.forms.set(form.id, form);
        return form;
    }

    get(id: string, actorId: string, guildId: string | null): ManualRegistrationForm | null {
        const form = this.forms.get(id);
        if (!form) return null;
        if (form.expiresAt <= this.now()) {
            this.forms.delete(id);
            return null;
        }
        return form.actorId === actorId && form.guildId === guildId ? form : null;
    }
}

export function manualRegistrationPanel(form: ManualRegistrationForm) {
    const components: (ReturnType<typeof card> | ActionRowBuilder<ButtonBuilder | UserSelectMenuBuilder>)[] =
        [
            card(
                `## ${label(form.context.title, 50)} · 참가자 추가`,
                form.feedback ?? form.context.reason ?? '서버 멤버를 선택하면 바로 신청합니다.'
            )
        ];
    if (form.pending)
        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`manual-registration:retry:${form.id}`)
                    .setLabel('같은 요청 다시 확인')
                    .setStyle(ButtonStyle.Primary)
            )
        );
    else if (form.context.canAdd)
        components.push(
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId(`manual-registration:select:${form.id}`)
                    .setPlaceholder('참가자로 추가할 서버 멤버')
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        );
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components,
        allowedMentions: { parse: [] as never[] }
    };
}

const expired = () =>
    notice('참가자 추가 화면이 만료됐어요. 모집 글의 참가자 추가 버튼으로 다시 열어 주세요.');

export async function handleManualRegistration(
    interaction: ButtonInteraction | UserSelectMenuInteraction,
    api: BotApi,
    forms: ManualRegistrationForms
) {
    const scrimId = /^manual-registration:open:([a-f0-9-]{36})$/.exec(interaction.customId)?.[1];
    if (scrimId && interaction.isButton()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.guildId) {
            await interaction.editReply(notice('서버 안에서 사용해 주세요.'));
            return;
        }
        const context = await api.manualRegistration(interaction.guildId, scrimId, interaction.user.id);
        await interaction.editReply(
            manualRegistrationPanel(forms.create(interaction.user.id, interaction.guildId, context))
        );
        return;
    }
    const parsed = /^manual-registration:(select|retry):([a-f0-9]{24})$/.exec(interaction.customId);
    const form = parsed ? forms.get(parsed[2]!, interaction.user.id, interaction.guildId) : null;
    if (!parsed || !form) {
        await interaction.reply({
            ...expired(),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    await interaction.deferUpdate();
    if (form.busy) return;
    const retry = parsed[1] === 'retry';
    if (form.pending && !retry) {
        await interaction.editReply(manualRegistrationPanel(form));
        return;
    }
    if (!retry && !form.context.canAdd) {
        await interaction.editReply(manualRegistrationPanel(form));
        return;
    }
    if (!retry) {
        if (!interaction.isUserSelectMenu() || interaction.values.length !== 1) {
            await interaction.editReply(expired());
            return;
        }
        form.pending = {
            actorId: form.actorId,
            userId: interaction.values[0]!,
            interactionId: interaction.id
        };
    }
    if (!form.pending) return;
    form.busy = true;
    try {
        const result = await api.addParticipant(form.guildId, form.context.scrimId, form.pending);
        form.context = result.context;
        form.feedback =
            `**${label(result.participant.name, 80)}**님을 ${result.participant.status === 'selected' ? '선발' : '대기'}로 추가했어요.` +
            (result.context.reason ? `\n${result.context.reason}` : '');
        form.pending = null;
    } catch (error) {
        // 저장 뒤 응답이 유실됐을 수 있어 불명확한 실패는 최초 대상과 멱등 키로만 다시 확인한다.
        if (error instanceof BotApiError && error.status < 500) {
            form.pending = null;
            if (error.status === 403)
                form.context = { ...form.context, canAdd: false, reason: error.message };
        }
        form.feedback =
            error instanceof BotApiError
                ? error.message
                : '요청 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.';
    } finally {
        form.busy = false;
    }
    await interaction.editReply(manualRegistrationPanel(form));
}
