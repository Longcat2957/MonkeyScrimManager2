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
import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import type {
    BotFailedPublication,
    BotPublicationKind,
    BotPublicationRetryInput
} from '../../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../api/client.js';
import { card, label, notice } from '../messages/shared.js';

const PREFIX = 'publication-recovery:';
const KINDS: Record<BotPublicationKind, string> = {
    recruitment: '모집',
    entry: '팀 구성',
    lineup: '출전 명단',
    result: '경기 결과',
    confirmation_dm: '참가 안내 DM'
};

export interface RecoveryForm {
    id: string;
    actorId: string;
    guildId: string;
    expiresAt: number;
    query: string;
    publications: BotFailedPublication[];
    selectedId: string | null;
    confirmingAbsent: boolean;
    busy: boolean;
    completed: boolean;
    feedback: string | null;
    pending: { id: string; input: BotPublicationRetryInput } | null;
}

export class RecoveryForms {
    private readonly forms = new Map<string, RecoveryForm>();
    constructor(
        private readonly now: () => number = Date.now,
        private readonly maximum = 1000
    ) {}

    create(actorId: string, guildId: string, publications: BotFailedPublication[]): RecoveryForm {
        for (const [id, form] of this.forms) if (form.expiresAt <= this.now()) this.forms.delete(id);
        if (this.forms.size >= this.maximum) this.forms.delete(this.forms.keys().next().value!);
        const form: RecoveryForm = {
            id: randomBytes(12).toString('hex'),
            actorId,
            guildId,
            expiresAt: this.now() + 10 * 60_000,
            query: '',
            publications: publications.slice(0, 25),
            selectedId: null,
            confirmingAbsent: false,
            busy: false,
            completed: false,
            feedback: null,
            pending: null
        };
        this.forms.set(form.id, form);
        return form;
    }

    get(id: string, actorId: string, guildId: string | null): RecoveryForm | null {
        const form = this.forms.get(id);
        if (!form) return null;
        if (form.expiresAt <= this.now()) {
            this.forms.delete(id);
            return null;
        }
        return form.actorId === actorId && form.guildId === guildId ? form : null;
    }
}

function button(form: RecoveryForm, action: string, title: string, style = ButtonStyle.Secondary) {
    return new ButtonBuilder()
        .setCustomId(PREFIX + form.id + ':' + action)
        .setLabel(title)
        .setStyle(style);
}

export function publicationChoiceName(item: BotFailedPublication): string {
    const prefix = `${KINDS[item.kind]} · ${item.state === 'uncertain' ? '전달 불명' : '게시 실패'}`;
    const target = item.targetLabel ? ' · ' + item.targetLabel : '';
    // 종류·대상과 내전 이름이 함께 보여 같은 경기의 서로 다른 작업을 구분한다.
    const shortened = (text: string, maximum: number) => {
        let result = '';
        for (const character of text) {
            if (result.length + character.length > maximum) break;
            result += character;
        }
        return result;
    };
    const targetText = shortened(target, Math.max(0, 100 - prefix.length - 24));
    return prefix + targetText + ' · ' + shortened(item.title, 100 - prefix.length - targetText.length - 3);
}

export function recoveryPanel(form: RecoveryForm) {
    const selected = form.publications.find((item) => item.id === form.selectedId);
    const sections = [form.query ? `검색: **${label(form.query, 100)}**` : '최근 갱신한 작업부터 표시해요.'];
    if (form.publications.length === 25)
        sections.push('25개까지 표시해요. 작업 검색으로 범위를 좁혀 주세요.');
    if (form.feedback) sections.push(form.feedback);
    if (selected && !form.completed)
        sections.push(
            `### ${label(selected.title, 100)}\n${KINDS[selected.kind]} · ${selected.state === 'uncertain' ? '전달 불명' : '게시 실패'}` +
                (selected.targetLabel ? `\n${label(selected.targetLabel, 250)}` : '')
        );
    const components: (
        ReturnType<typeof card> | ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>
    )[] = [card('## 게시 복구', ...sections)];
    const reply = {
        flags: MessageFlags.IsComponentsV2 as const,
        components,
        allowedMentions: { parse: [] as never[] }
    };
    if (form.pending) {
        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                button(form, 'resend', '같은 요청 다시 확인', ButtonStyle.Primary)
            )
        );
        return reply;
    }
    if (form.confirmingAbsent && selected) {
        components.push(
            card(
                selected.kind === 'confirmation_dm'
                    ? '수신자에게 참가 안내 DM이 없음을 확인했나요? 확인한 경우에만 새 전송을 예약해 주세요.'
                    : '대상 채널에 이 작업의 글이 없음을 확인했나요? 확인한 경우에만 새 게시를 예약해 주세요.'
            )
        );
        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                button(form, 'confirm-absent', '글 없음 확인 후 복구', ButtonStyle.Danger),
                button(form, 'cancel-absent', '돌아가기')
            )
        );
        return reply;
    }
    if (!form.completed && form.publications.length) {
        components.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(PREFIX + form.id + ':select')
                    .setPlaceholder('복구할 게시 작업 선택')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        form.publications.map((item) => ({
                            label: publicationChoiceName(item),
                            value: item.id,
                            default: item.id === form.selectedId
                        }))
                    )
            )
        );
    } else if (!form.completed)
        components.push(card('복구할 작업이 없어요. 검색어를 바꾸거나 목록을 새로고침해 주세요.'));
    if (selected && !form.completed) {
        const actions = new ActionRowBuilder<ButtonBuilder>();
        if (selected.state === 'blocked')
            actions.addComponents(button(form, 'retry', '다시 시도', ButtonStyle.Primary));
        actions.addComponents(
            button(form, 'message', '기존 글 연결').setDisabled(!selected.channelId),
            button(form, 'absent', '글 없음 확인')
        );
        components.push(actions);
    }
    components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            button(form, 'search', '작업 검색'),
            button(form, 'refresh', '목록 새로고침')
        )
    );
    return reply;
}

const expired = () => notice('복구 화면이 만료됐어요. /게시복구로 다시 열어 주세요.');

function modal(form: RecoveryForm, message: BotFailedPublication | null) {
    const field = new TextInputBuilder()
        .setCustomId('value')
        .setStyle(TextInputStyle.Short)
        .setRequired(Boolean(message))
        .setMaxLength(message ? 200 : 100);
    if (!message && form.query) field.setValue(form.query);
    field.setPlaceholder(message ? '메시지 링크 또는 메시지 ID' : '내전 제목·경기·세트·수신자 이름');
    return new ModalBuilder()
        .setCustomId(PREFIX + form.id + (message ? ':message:' + message.id : ':search'))
        .setTitle(message ? '기존 글로 복구 예약' : '게시 작업 검색')
        .addLabelComponents(
            new LabelBuilder().setLabel(message ? '기존 메시지' : '검색어').setTextInputComponent(field)
        );
}

export async function openRecoveryPanel(
    interaction: ChatInputCommandInteraction,
    api: BotApi,
    forms: RecoveryForms
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) {
        await interaction.editReply(notice('서버 안에서 명령을 사용해 주세요.'));
        return;
    }
    const { publications } = await api.failedPublications(interaction.guildId, interaction.user.id);
    const form = forms.create(interaction.user.id, interaction.guildId, publications);
    await interaction.editReply(recoveryPanel(form));
}

function failureText(error: unknown): string {
    return error instanceof BotApiError
        ? error.message
        : '요청 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.';
}

async function retry(
    form: RecoveryForm,
    api: BotApi,
    interactionId: string,
    input: { messageId?: string; confirmAbsent?: boolean }
) {
    if (!form.pending)
        form.pending = {
            id: form.selectedId!,
            input: { actorId: form.actorId, interactionId, ...input }
        };
    try {
        await api.retryPublication(form.guildId, form.pending.id, form.pending.input);
        form.pending = null;
        form.completed = true;
        form.confirmingAbsent = false;
        form.feedback = '게시 작업을 다시 처리하도록 예약했어요.';
    } catch (error) {
        // 전송 뒤 응답 유실일 수 있으므로 불명확한 실패는 같은 멱등 키·내용으로만 다시 확인한다.
        if (error instanceof BotApiError && error.status < 500) form.pending = null;
        form.feedback = failureText(error);
    }
}

export async function handleRecoveryComponent(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    api: BotApi,
    forms: RecoveryForms
) {
    const parsed = /^publication-recovery:([a-f0-9]{24}):([a-z-]+)$/.exec(interaction.customId);
    const form = parsed ? forms.get(parsed[1]!, interaction.user.id, interaction.guildId) : null;
    if (!parsed || !form) {
        await interaction.reply({
            ...expired(),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    if (form.busy) {
        await interaction.reply({
            ...notice('복구 요청을 처리하고 있어요.'),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    const action = parsed[2]!;
    const selected = form.publications.find((item) => item.id === form.selectedId);
    if (action === 'search' && !form.pending && !form.confirmingAbsent) {
        await interaction.showModal(modal(form, null));
        return;
    }
    if (
        action === 'message' &&
        selected?.channelId &&
        !form.completed &&
        !form.pending &&
        !form.confirmingAbsent
    ) {
        await interaction.showModal(modal(form, selected));
        return;
    }
    form.busy = true;
    try {
        await interaction.deferUpdate();
        if (form.pending) {
            if (action === 'resend') await retry(form, api, interaction.id, {});
        } else if (action === 'refresh') {
            const { publications } = await api.failedPublications(form.guildId, form.actorId, form.query);
            form.publications = publications.slice(0, 25);
            form.selectedId = null;
            form.completed = false;
            form.feedback = null;
            form.confirmingAbsent = false;
        } else if (
            action === 'select' &&
            interaction.isStringSelectMenu() &&
            !form.completed &&
            !form.confirmingAbsent
        ) {
            const id = interaction.values[0];
            if (!form.publications.some((item) => item.id === id))
                throw new BotApiError(400, 'INVALID_PUBLICATION', '목록에서 작업을 다시 선택해 주세요.');
            form.selectedId = id!;
            form.feedback = null;
        } else if (selected && !form.completed) {
            if (action === 'absent') form.confirmingAbsent = true;
            else if (action === 'cancel-absent') form.confirmingAbsent = false;
            else if (action === 'confirm-absent' && form.confirmingAbsent)
                await retry(form, api, interaction.id, { confirmAbsent: true });
            else if (action === 'retry' && selected.state === 'blocked' && !form.confirmingAbsent)
                await retry(form, api, interaction.id, {});
        }
        await interaction.editReply(recoveryPanel(form));
    } catch (error) {
        form.feedback = failureText(error);
        await interaction.editReply(recoveryPanel(form));
    } finally {
        form.busy = false;
    }
}

export function recoveryMessageId(value: string): string | null {
    const cleaned = value.trim();
    if (/^\d{17,20}$/.test(cleaned)) return cleaned;
    try {
        const url = new URL(cleaned);
        if (
            url.protocol !== 'https:' ||
            !['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(
                url.hostname
            ) ||
            url.username ||
            url.password
        )
            return null;
        return /^\/channels\/(?:@me|\d{17,20})\/\d{17,20}\/(\d{17,20})\/?$/.exec(url.pathname)?.[1] ?? null;
    } catch {
        return null;
    }
}

export async function submitRecoveryModal(
    interaction: ModalSubmitInteraction,
    api: BotApi,
    forms: RecoveryForms
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const parsed = /^publication-recovery:([a-f0-9]{24}):(search|message)(?::([a-f0-9-]{36}))?$/.exec(
        interaction.customId
    );
    const form = parsed ? forms.get(parsed[1]!, interaction.user.id, interaction.guildId) : null;
    if (!parsed || !form) {
        await interaction.editReply(expired());
        return;
    }
    if (form.busy) {
        await interaction.editReply(notice('복구 요청을 처리하고 있어요.'));
        return;
    }
    form.busy = true;
    try {
        if (form.pending)
            throw new BotApiError(409, 'PENDING_REQUEST', '이전 복구 요청의 결과를 먼저 확인해 주세요.');
        const value = interaction.fields.getTextInputValue('value');
        if (parsed[2] === 'search') {
            const query = value.trim();
            if (query.length > 100)
                throw new BotApiError(400, 'INVALID_QUERY', '검색어는 100자 이내로 입력해 주세요.');
            const { publications } = await api.failedPublications(form.guildId, form.actorId, query);
            form.query = query;
            form.publications = publications.slice(0, 25);
            form.selectedId = null;
            form.completed = false;
            form.confirmingAbsent = false;
            form.feedback = null;
        } else {
            const selected = form.publications.find((item) => item.id === parsed[3]);
            if (!selected || selected.id !== form.selectedId || form.completed || !selected.channelId)
                throw new BotApiError(
                    409,
                    'STALE_PUBLICATION',
                    '작업을 다시 선택한 뒤 기존 글을 연결해 주세요.'
                );
            const messageId = recoveryMessageId(value);
            if (!messageId)
                throw new BotApiError(400, 'INVALID_MESSAGE', '메시지 링크 또는 ID를 확인해 주세요.');
            await retry(form, api, interaction.id, { messageId });
        }
        await interaction.editReply(recoveryPanel(form));
    } catch (error) {
        form.feedback = failureText(error);
        await interaction.editReply(recoveryPanel(form));
    } finally {
        form.busy = false;
    }
}
