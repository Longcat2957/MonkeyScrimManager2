import { randomBytes } from 'node:crypto';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    StringSelectMenuBuilder
} from 'discord.js';
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { BotPosition, BotRegistrationContext } from '../../../../shared/bot-api.js';
import type { BotApi } from '../api/client.js';
import { BotApiError } from '../api/client.js';
import { card, label, notice, POSITIONS } from '../messages/shared.js';

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;
export interface RegistrationForm {
    id: string;
    actorId: string;
    guildId: string;
    expiresAt: number;
    context: BotRegistrationContext;
    accountId: string;
    positions: BotPosition[];
    accountPage: number;
    confirmingWithdrawal: boolean;
    busy: boolean;
    feedback: string | null;
}

export function activeRegistration(context: BotRegistrationContext): boolean {
    return context.registration?.status === 'selected' || context.registration?.status === 'standby';
}

export class RegistrationForms {
    private readonly forms = new Map<string, RegistrationForm>();
    constructor(
        private readonly now: () => number = Date.now,
        private readonly maximum = 1000
    ) {}

    create(actorId: string, guildId: string, context: BotRegistrationContext): RegistrationForm {
        for (const [id, form] of this.forms) if (form.expiresAt <= this.now()) this.forms.delete(id);
        if (this.forms.size >= this.maximum) this.forms.delete(this.forms.keys().next().value!);
        const accountId =
            context.registration?.riotAccountId ??
            context.accounts.find((account) => account.isPrimary)?.id ??
            context.accounts[0]?.id ??
            '';
        const form: RegistrationForm = {
            id: randomBytes(12).toString('hex'),
            actorId,
            guildId,
            expiresAt: this.now() + 10 * 60_000,
            context,
            accountId,
            positions: context.registration?.positions.slice() ?? [],
            accountPage: 0,
            confirmingWithdrawal: false,
            busy: false,
            feedback: null
        };
        this.forms.set(form.id, form);
        return form;
    }

    get(id: string, actorId: string, guildId: string | null): RegistrationForm | null {
        const form = this.forms.get(id);
        if (!form) return null;
        if (form.expiresAt <= this.now()) {
            this.forms.delete(id);
            return null;
        }
        return form.actorId === actorId && form.guildId === guildId ? form : null;
    }
}

export function parseFormId(value: string): { id: string; action: string } | null {
    const match =
        /^form:([a-f0-9]{24}):(account|positions|submit|withdraw|confirm|cancel|previous|next)$/.exec(value);
    return match ? { id: match[1]!, action: match[2]! } : null;
}

export function renderForm(form: RegistrationForm) {
    const current = form.context.registration;
    const status = current
        ? { selected: '선발', standby: '대기', withdrawn: '철회', excluded: '제외' }[current.status]
        : '신청 전';
    const account = form.context.accounts.find((value) => value.id === form.accountId);
    const parts = [`## ${label(form.context.title, 50)} · 내 신청`, `현재 상태: **${status}**`];
    if (form.feedback) parts.push(form.feedback);
    if (form.context.reason) parts.push(form.context.reason);
    if (form.context.accounts.length === 1 || !form.context.canEdit)
        parts.push(`계정: ${account ? label(account.label) : '연결된 계정 없음'}`);
    if (!form.context.canEdit)
        parts.push(
            `희망 포지션: ${form.positions.map((position) => POSITIONS[position]).join(' / ') || '미설정'}`
        );
    const components: (
        ReturnType<typeof card> | ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>
    )[] = [card(parts.join('\n\n'))];
    const message = {
        flags: MessageFlags.IsComponentsV2 as const,
        components,
        allowedMentions: { parse: [] as never[] }
    };
    const customId = (action: string) => `form:${form.id}:${action}`;
    if (!form.context.canEdit) return message;
    if (form.confirmingWithdrawal) {
        components.push(card('신청을 철회할까요? 빈자리는 대기자에게 돌아갈 수 있어요.'));
        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(customId('confirm'))
                    .setLabel('철회하기')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(customId('cancel'))
                    .setLabel('돌아가기')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
        return message;
    }
    if (form.context.accounts.length > 1) {
        const accounts = form.context.accounts.slice(form.accountPage * 25, form.accountPage * 25 + 25);
        components.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(customId('account'))
                    .setPlaceholder(account ? `계정: ${account.label}`.slice(0, 150) : '참가 계정 선택')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        accounts.map((value) => ({
                            label: value.label.slice(0, 100),
                            value: value.id,
                            default: value.id === form.accountId
                        }))
                    )
            )
        );
        if (form.context.accounts.length > 25)
            components.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(customId('previous'))
                        .setLabel('이전 계정')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(form.accountPage === 0),
                    new ButtonBuilder()
                        .setCustomId(customId('next'))
                        .setLabel('다음 계정')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled((form.accountPage + 1) * 25 >= form.context.accounts.length)
                )
            );
    }
    if (form.context.accounts.length) {
        components.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(customId('positions'))
                    .setPlaceholder('희망 포지션 선택')
                    .setMinValues(1)
                    .setMaxValues(5)
                    .addOptions(
                        Object.entries(POSITIONS).map(([value, title]) => ({
                            label: title,
                            value,
                            default: form.positions.includes(value as BotPosition)
                        }))
                    )
            )
        );
    }
    const actions = new ActionRowBuilder<ButtonBuilder>();
    if (form.context.accounts.length)
        actions.addComponents(
            new ButtonBuilder()
                .setCustomId(customId('submit'))
                .setLabel(activeRegistration(form.context) ? '수정하기' : '신청하기')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!account || form.positions.length === 0)
        );
    if (activeRegistration(form.context))
        actions.addComponents(
            new ButtonBuilder()
                .setCustomId(customId('withdraw'))
                .setLabel('철회')
                .setStyle(ButtonStyle.Secondary)
        );
    if (actions.components.length) components.push(actions);
    return message;
}

export async function handleRegistration(
    interaction: ComponentInteraction,
    api: BotApi,
    forms: RegistrationForms
) {
    const opener = /^registration:([a-f0-9-]{36})$/.exec(interaction.customId);
    if (opener) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.guildId) {
            await interaction.editReply(notice('서버의 모집 글에서 신청해 주세요.'));
            return;
        }
        const context = await api.registration(interaction.guildId, opener[1]!, interaction.user.id);
        const form = forms.create(interaction.user.id, interaction.guildId, context);
        await interaction.editReply(renderForm(form));
        return;
    }
    const parsed = parseFormId(interaction.customId);
    const form = parsed ? forms.get(parsed.id, interaction.user.id, interaction.guildId) : null;
    if (!parsed || !form) {
        await interaction.reply({
            ...notice('신청 화면이 만료됐어요. 모집 글의 내 신청을 다시 열어 주세요.'),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    if (form.busy) {
        await interaction.reply({
            ...notice('신청을 처리하고 있어요. 잠시 기다려 주세요.'),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    form.busy = true;
    try {
        await interaction.deferUpdate();
        form.feedback = null;
        if (parsed.action === 'account' && interaction.isStringSelectMenu()) {
            const account = interaction.values[0];
            if (!form.context.accounts.some((value) => value.id === account))
                throw new BotApiError(400, 'INVALID_ACCOUNT', '다시 계정을 선택해 주세요.');
            form.accountId = account!;
        } else if (parsed.action === 'positions' && interaction.isStringSelectMenu()) {
            if (
                !interaction.values.length ||
                interaction.values.some((value) => !Object.hasOwn(POSITIONS, value))
            ) {
                throw new BotApiError(400, 'INVALID_POSITION', '희망 포지션을 선택해 주세요.');
            }
            form.positions = [...new Set(interaction.values)] as BotPosition[];
        } else if (parsed.action === 'previous') {
            form.accountPage = Math.max(0, form.accountPage - 1);
        } else if (parsed.action === 'next') {
            form.accountPage = Math.min(
                Math.floor((form.context.accounts.length - 1) / 25),
                form.accountPage + 1
            );
        } else if (parsed.action === 'withdraw') {
            form.confirmingWithdrawal = true;
        } else if (parsed.action === 'cancel') {
            form.confirmingWithdrawal = false;
        } else if (parsed.action === 'submit' || parsed.action === 'confirm') {
            if (!form.context.canEdit || (parsed.action === 'confirm' && !form.confirmingWithdrawal)) {
                throw new BotApiError(409, 'STALE_FORM', '모집 글에서 내 신청을 다시 열어 주세요.');
            }
            const action =
                parsed.action === 'confirm'
                    ? 'withdraw'
                    : activeRegistration(form.context)
                      ? 'update'
                      : 'create';
            form.context = await api.saveRegistration(form.guildId, form.context.scrimId, {
                actorId: form.actorId,
                interactionId: interaction.id,
                action,
                ...(action !== 'create' && form.context.registration
                    ? { registrationId: form.context.registration.id }
                    : {}),
                ...(action === 'withdraw' ? {} : { riotAccountId: form.accountId, positions: form.positions })
            });
            form.confirmingWithdrawal = false;
            form.feedback =
                action === 'withdraw'
                    ? '신청을 철회했어요.'
                    : action === 'update'
                      ? '신청을 수정했어요.'
                      : '신청했어요.';
            form.positions = form.context.registration?.positions.slice() ?? form.positions;
            form.accountId = form.context.registration?.riotAccountId ?? form.accountId;
        }
        await interaction.editReply(renderForm(form));
    } finally {
        form.busy = false;
    }
}
