import { randomBytes } from 'node:crypto';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    StringSelectMenuBuilder
} from 'discord.js';
import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { BotPosition, BotRegistrationContext } from '../../../../shared/bot-api.js';
import type { BotApi } from '../api/client.js';
import { BotApiError } from '../api/client.js';
import { formatKstMinute, scheduleFromKst } from '../commands/schedule.js';
import { standbyModal, standbyPrompt } from '../messages/standby.js';
import { card, label, notice, POSITIONS, preferredPositionLabel } from '../messages/shared.js';

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
        const accountId = context.registration
            ? (context.registration.riotAccountId ?? '')
            : (context.accounts.find((account) => account.isPrimary)?.id ?? context.accounts[0]?.id ?? '');
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
        ? {
              selected: '선발',
              standby: standbyStatus(current.availableAt),
              withdrawn: '철회',
              excluded: '제외'
          }[current.status]
        : '신청 전';
    const account = form.context.accounts.find((value) => value.id === form.accountId);
    const parts = [`## ${label(form.context.title, 50)} · 내 신청`, `현재 상태: **${status}**`];
    if (form.feedback) parts.push(form.feedback);
    if (form.context.reason) parts.push(form.context.reason);
    if (!form.context.accounts.length || !form.context.canEdit)
        parts.push(`계정: ${account ? label(account.label) : '미지정'}`);
    if (!form.context.canEdit)
        parts.push(`희망 포지션: ${preferredPositionLabel(form.positions) || '미설정'}`);
    const components: (
        | ReturnType<typeof card>
        | ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>
    )[] = [card(parts[0]!, parts.slice(1).join('\n\n'))];
    const message = {
        flags: MessageFlags.IsComponentsV2 as const,
        components,
        allowedMentions: { parse: [] as never[] }
    };
    const customId = (action: string) => `form:${form.id}:${action}`;
    if (!form.context.canEdit) return message;
    if (form.confirmingWithdrawal) {
        components.push(card('신청을 철회할까요?'));
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
    if (form.context.accounts.length) {
        const accounts = form.context.accounts.slice(form.accountPage * 24, form.accountPage * 24 + 24);
        components.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(customId('account'))
                    .setPlaceholder(
                        account ? `계정: ${account.label}`.slice(0, 150) : '참가 계정 선택 (선택 사항)'
                    )
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions([
                        { label: '계정 없이 참가', value: 'none', default: !form.accountId },
                        ...accounts.map((value) => ({
                            label: value.label.slice(0, 100),
                            value: value.id,
                            default: value.id === form.accountId
                        }))
                    ])
            )
        );
        if (form.context.accounts.length > 24)
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
                        .setDisabled((form.accountPage + 1) * 24 >= form.context.accounts.length)
                )
            );
    }
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
    const actions = new ActionRowBuilder<ButtonBuilder>();
    actions.addComponents(
        new ButtonBuilder()
            .setCustomId(customId('submit'))
            .setLabel(activeRegistration(form.context) ? '수정하기' : '신청하기')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(form.positions.length === 0)
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

function standbyStatus(availableAt: string | null) {
    return availableAt
        ? `${formatKstMinute(Date.parse(availableAt))} KST부터 합류 가능 · 선발 대기 중`
        : '시각 지정 없이 수동 배정 대기 중';
}

function joinPreferences(context: BotRegistrationContext) {
    return {
        riotAccountId:
            context.accounts.find((account) => account.isPrimary)?.id ?? context.accounts[0]?.id ?? null,
        positions: context.registration?.positions.length
            ? context.registration.positions
            : (Object.keys(POSITIONS) as BotPosition[])
    };
}

export async function submitStandbyTime(interaction: ModalSubmitInteraction, api: BotApi) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const match = /^standby-time:([a-f0-9-]{36}):(\d{1,15})$/.exec(interaction.customId);
    if (!match || !interaction.guildId) {
        await interaction.editReply(notice('모집 글에서 대기 신청을 다시 열어 주세요.'));
        return;
    }
    const scrimId = match[1]!;
    const context = await api.registration(interaction.guildId, scrimId, interaction.user.id);
    if (!context.canEdit) {
        await interaction.editReply(notice(context.reason ?? '지금은 대기 신청을 변경할 수 없어요.'));
        return;
    }
    const retry = (message: string) =>
        interaction.editReply(standbyPrompt(message, scrimId, context.scheduledAt));
    const start = Number(match[2]);
    if (!context.scheduledAt || Date.parse(context.scheduledAt) !== start) {
        await retry('예정 시작 시각이 변경됐어요. 새 일정을 확인하고 합류 시각을 다시 입력해 주세요.');
        return;
    }
    let availableAt: string | null;
    try {
        availableAt = scheduleFromKst(interaction.fields.getTextInputValue('availableAt'));
    } catch {
        availableAt = null;
    }
    if (!availableAt) {
        await retry('합류 가능한 날짜와 시각을 한국 시간으로 YYYY-MM-DD HH:mm 형식에 맞춰 입력해 주세요.');
        return;
    }
    const arrival = Date.parse(availableAt);
    if (arrival <= start) {
        await retry(`예정 시작(${formatKstMinute(start)})보다 늦은 합류 시각을 입력해 주세요.`);
        return;
    }
    if (arrival <= Date.now()) {
        await retry('이미 지난 합류 시각이에요. 지금보다 늦은 시각을 입력해 주세요.');
        return;
    }
    if (context.registration?.status === 'standby' && context.registration.availableAt === availableAt) {
        await interaction.editReply(notice(`현재 상태 · ${standbyStatus(availableAt)}`));
        return;
    }
    const saved = await api.saveRegistration(interaction.guildId, scrimId, {
        action: 'standby',
        actorId: interaction.user.id,
        interactionId: interaction.id,
        expectedScheduledAt: context.scheduledAt,
        availableAt,
        ...(activeRegistration(context)
            ? { registrationId: context.registration!.id }
            : joinPreferences(context))
    });
    await interaction.editReply(
        notice(`대기 신청을 저장했어요. ${standbyStatus(saved.registration!.availableAt)}`)
    );
}

export async function handleRegistration(
    interaction: ComponentInteraction,
    api: BotApi,
    forms: RegistrationForms
) {
    const standby = /^registration-standby:([a-f0-9-]{36})(?::(\d{1,15}|unset))?$/.exec(interaction.customId);
    if (standby && interaction.guildId) {
        const scrimId = standby[1]!;
        let start = Number(standby[2]);
        if (!standby[2]) {
            // 이전 모집 글의 제목 바로 아래에 있는 Discord 타임스탬프를 읽는다.
            const card = interaction.message.components[0];
            const heading = card?.type === ComponentType.Container ? card.components[0] : null;
            if (heading?.type === ComponentType.TextDisplay) {
                const timestamp = /^<t:(\d+):F>$/m.exec(heading.content)?.[1];
                if (timestamp) start = Number(timestamp) * 1000;
            }
        }
        if (Number.isFinite(start)) {
            await interaction.showModal(standbyModal(scrimId, start, interaction.createdTimestamp));
        } else {
            // 공지에서 시각을 읽을 수 없는 경우에도 조회 전에 Discord에 응답한다.
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const context = await api.registration(interaction.guildId, scrimId, interaction.user.id);
            await interaction.editReply(
                context.canEdit
                    ? standbyPrompt('합류 가능한 날짜와 시각을 입력해 주세요.', scrimId, context.scheduledAt)
                    : notice(context.reason ?? '대기 신청이 마감됐어요.')
            );
        }
        return;
    }
    const opener = /^registration(?:-(withdraw))?:([a-f0-9-]{36})$/.exec(interaction.customId);
    if (opener) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.guildId) {
            await interaction.editReply(notice('서버의 모집 글에서 신청해 주세요.'));
            return;
        }
        let context = await api.registration(interaction.guildId, opener[2]!, interaction.user.id);
        if (opener[1] === 'withdraw') {
            if (!activeRegistration(context)) {
                await interaction.editReply(notice('참가 중인 신청이 없어요.'));
                return;
            }
            if (!context.canEdit) {
                await interaction.editReply(notice(context.reason ?? '지금은 신청을 변경할 수 없어요.'));
                return;
            }
            await api.saveRegistration(interaction.guildId, context.scrimId, {
                actorId: interaction.user.id,
                interactionId: interaction.id,
                action: 'withdraw',
                registrationId: context.registration!.id
            });
            await interaction.editReply(notice('참가를 취소했어요.'));
            return;
        }
        // 기존 대기자는 선발로 바꾸지 않고 본인 신청 화면(계정·희망 포지션 수정, 철회)을 연다.
        let joined = false;
        if (context.canEdit && !activeRegistration(context)) {
            // 처음에는 전 포지션을 허용하고, 희망 포지션은 신청 뒤 필요한 경우 수정한다.
            context = await api.saveRegistration(interaction.guildId, context.scrimId, {
                actorId: interaction.user.id,
                interactionId: interaction.id,
                action: 'create',
                ...joinPreferences(context)
            });
            joined = true;
        }
        const form = forms.create(interaction.user.id, interaction.guildId, context);
        if (joined) form.feedback = '신청했어요. 희망 포지션은 필요하면 수정해 주세요.';
        await interaction.editReply(renderForm(form));
        return;
    }
    const parsed = parseFormId(interaction.customId);
    const form = parsed ? forms.get(parsed.id, interaction.user.id, interaction.guildId) : null;
    if (!parsed || !form) {
        await interaction.reply({
            ...notice(
                interaction.customId.endsWith(':standby')
                    ? '모집 글에서 대기 신청을 다시 열어 주세요.'
                    : '신청 화면이 만료됐어요. 모집 글의 참가하기를 다시 눌러 주세요.'
            ),
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
            if (account !== 'none' && !form.context.accounts.some((value) => value.id === account))
                throw new BotApiError(400, 'INVALID_ACCOUNT', '다시 계정을 선택해 주세요.');
            form.accountId = account === 'none' ? '' : account!;
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
                Math.floor((form.context.accounts.length - 1) / 24),
                form.accountPage + 1
            );
        } else if (parsed.action === 'withdraw') {
            form.confirmingWithdrawal = true;
        } else if (parsed.action === 'cancel') {
            form.confirmingWithdrawal = false;
        } else if (parsed.action === 'submit' || parsed.action === 'confirm') {
            if (!form.context.canEdit || (parsed.action === 'confirm' && !form.confirmingWithdrawal)) {
                throw new BotApiError(409, 'STALE_FORM', '모집 글의 참가하기를 다시 눌러 주세요.');
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
                ...(action === 'withdraw'
                    ? {}
                    : { riotAccountId: form.accountId || null, positions: form.positions })
            });
            form.confirmingWithdrawal = false;
            form.feedback =
                action === 'withdraw'
                    ? '신청을 철회했어요.'
                    : action === 'update'
                      ? '신청을 수정했어요.'
                      : '신청했어요.';
            form.positions = form.context.registration?.positions.slice() ?? form.positions;
            form.accountId = form.context.registration?.riotAccountId ?? '';
        }
        await interaction.editReply(renderForm(form));
    } finally {
        form.busy = false;
    }
}
