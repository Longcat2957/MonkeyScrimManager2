import { randomBytes } from 'node:crypto';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import type { BotSeasonSnapshot } from '../../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../api/client.js';
import { card, CARD_COLORS, label, notice } from '../messages/shared.js';

interface SeasonPanel {
    id: string;
    actorId: string;
    guildId: string;
    expiresAt: number;
    snapshot: BotSeasonSnapshot;
    page: number;
    name: string;
    version: number;
    requestId: string | null;
    busy: boolean;
    result: BotSeasonSnapshot | null;
}

export class SeasonPanels {
    private readonly panels = new Map<string, SeasonPanel>();
    constructor(
        private readonly now: () => number = Date.now,
        private readonly maximum = 1000
    ) {}

    create(actorId: string, guildId: string, snapshot: BotSeasonSnapshot): SeasonPanel {
        for (const [id, panel] of this.panels) if (panel.expiresAt <= this.now()) this.panels.delete(id);
        if (this.panels.size >= this.maximum) this.panels.delete(this.panels.keys().next().value!);
        const panel: SeasonPanel = {
            id: randomBytes(12).toString('hex'),
            actorId,
            guildId,
            snapshot,
            expiresAt: this.now() + 10 * 60_000,
            page: 0,
            name: '',
            version: 0,
            requestId: null,
            busy: false,
            result: null
        };
        this.panels.set(panel.id, panel);
        return panel;
    }

    get(id: string, actorId: string, guildId: string | null): SeasonPanel | null {
        const panel = this.panels.get(id);
        if (!panel) return null;
        if (panel.expiresAt <= this.now()) {
            this.panels.delete(id);
            return null;
        }
        return panel.actorId === actorId && panel.guildId === guildId ? panel : null;
    }
}

const PAGE_SIZE = 8;
const date = (value: string) =>
    new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' }).format(new Date(value));
const expired = () => notice('시즌 화면이 만료되었거나 바뀌었어요. /시즌으로 다시 열어 주세요.');
const actionId = (panel: SeasonPanel, action: string) => `season:${action}:${panel.id}`;

function button(panel: SeasonPanel, action: string, title: string, style = ButtonStyle.Secondary) {
    return new ButtonBuilder().setCustomId(actionId(panel, action)).setLabel(title).setStyle(style);
}

export function renderSeasonPanel(panel: SeasonPanel) {
    const { current, completed } = panel.snapshot;
    if (!current && !completed.length)
        return notice('아직 시즌이 없어요. /초기설정으로 첫 시즌을 준비해 주세요.');
    const pages = Math.max(1, Math.ceil(completed.length / PAGE_SIZE));
    const history = completed
        .slice(panel.page * PAGE_SIZE, (panel.page + 1) * PAGE_SIZE)
        .map(
            (season) =>
                `**${label(season.name, 100)}** · ${date(season.startedAt)} ~ ${date(season.endedAt!)}`
        );
    const components: (ReturnType<typeof card> | ActionRowBuilder<ButtonBuilder>)[] = [
        card(
            '## 시즌',
            current
                ? `### 현재 시즌\n**${label(current.name, 100)}** · ${date(current.startedAt)} 시작`
                : '현재 진행 중인 시즌이 없어요.',
            `### 종료 시즌${pages > 1 ? ` · ${panel.page + 1}/${pages}` : ''}\n${history.join('\n') || '없음'}`
        )
    ];
    const controls = new ActionRowBuilder<ButtonBuilder>();
    if (pages > 1)
        controls.addComponents(
            button(panel, 'previous', '이전').setDisabled(panel.page === 0),
            button(panel, 'next', '다음').setDisabled(panel.page + 1 >= pages)
        );
    if (current) controls.addComponents(button(panel, 'new', '새 시즌 시작', ButtonStyle.Primary));
    if (controls.components.length) components.push(controls);
    return {
        flags: MessageFlags.IsComponentsV2 as const,
        components,
        allowedMentions: { parse: [] as never[] }
    };
}

export function seasonNameModal(panel: SeasonPanel) {
    const input = new TextInputBuilder()
        .setCustomId('name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(100)
        .setPlaceholder('예: 2027 봄 시즌');
    if (panel.name) input.setValue(panel.name);
    return new ModalBuilder()
        .setCustomId(actionId(panel, 'name'))
        .setTitle('새 시즌 시작')
        .addLabelComponents(new LabelBuilder().setLabel('새 시즌 이름').setTextInputComponent(input));
}

function confirmation(panel: SeasonPanel) {
    return {
        ...notice('시즌 전환'),
        components: [
            card(
                '## 시즌 전환',
                `**${label(panel.snapshot.current!.name, 100)}** 시즌을 종료하고 **${label(panel.name, 100)}** 시즌을 시작합니다.`,
                '기존 내전과 전적은 원래 시즌에 유지됩니다.'
            ).setAccentColor(CARD_COLORS.warning),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${actionId(panel, 'confirm')}:${panel.version}`)
                    .setLabel('시즌 전환')
                    .setStyle(ButtonStyle.Danger),
                button(panel, 'back', '돌아가기')
            )
        ]
    };
}

function completed(panel: SeasonPanel) {
    return {
        ...notice('시즌 전환 완료'),
        components: [
            card(
                '## 시즌 전환 완료',
                `**${label(panel.result!.current!.name, 100)}** 시즌을 시작했어요.`
            ).setAccentColor(CARD_COLORS.success)
        ]
    };
}

export async function openSeasonPanel(
    interaction: ChatInputCommandInteraction,
    api: BotApi,
    panels: SeasonPanels
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) {
        await interaction.editReply(notice('서버 안에서 명령을 사용해 주세요.'));
        return;
    }
    const snapshot = await api.seasons(interaction.guildId, interaction.user.id);
    await interaction.editReply(
        renderSeasonPanel(panels.create(interaction.user.id, interaction.guildId, snapshot))
    );
}

export async function submitSeasonName(
    interaction: ModalSubmitInteraction,
    _api: BotApi,
    panels: SeasonPanels
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = /^season:name:([a-f0-9]{24})$/.exec(interaction.customId)?.[1];
    const panel = id ? panels.get(id, interaction.user.id, interaction.guildId) : null;
    if (!panel || panel.busy || panel.result || !panel.snapshot.current || panel.requestId) {
        await interaction.editReply(expired());
        return;
    }
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name || name.length > 100) {
        await interaction.editReply(notice('새 시즌 이름은 1~100자로 입력해 주세요.'));
        return;
    }
    panel.name = name;
    panel.version++;
    await interaction.editReply(confirmation(panel));
}

export async function handleSeasonButton(interaction: ButtonInteraction, api: BotApi, panels: SeasonPanels) {
    const match = /^season:(new|previous|next|back|confirm):([a-f0-9]{24})(?::([0-9]+))?$/.exec(
        interaction.customId
    );
    const panel = match ? panels.get(match[2]!, interaction.user.id, interaction.guildId) : null;
    if (!panel || !match) {
        await interaction.reply({
            ...expired(),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
    }
    const action = match[1]!;
    if (action === 'new' && !panel.busy && !panel.result && !panel.requestId && panel.snapshot.current) {
        await interaction.showModal(seasonNameModal(panel));
        return;
    }
    await interaction.deferUpdate();
    if (panel.result) {
        await interaction.editReply(completed(panel));
        return;
    }
    if (panel.busy) return;
    if (action === 'previous' || action === 'next' || action === 'back') {
        if (panel.requestId) {
            await interaction.editReply(expired());
            return;
        }
        panel.page =
            action === 'previous'
                ? Math.max(0, panel.page - 1)
                : action === 'next'
                  ? Math.min(
                        Math.max(0, Math.ceil(panel.snapshot.completed.length / PAGE_SIZE) - 1),
                        panel.page + 1
                    )
                  : panel.page;
        if (action === 'back') {
            panel.name = '';
            panel.version++;
        }
        await interaction.editReply(renderSeasonPanel(panel));
        return;
    }
    if (
        action !== 'confirm' ||
        !panel.name ||
        Number(match[3]) !== panel.version ||
        !panel.snapshot.current
    ) {
        await interaction.editReply(expired());
        return;
    }
    panel.busy = true;
    // 응답이 유실돼 같은 확인이 다시 도착해도 최초 확인 요청의 키를 유지한다.
    panel.requestId ??= interaction.id;
    try {
        const result = await api.rotateSeason(panel.guildId, {
            actorId: panel.actorId,
            interactionId: panel.requestId,
            expectedCurrentSeasonId: panel.snapshot.current.id,
            name: panel.name,
            confirm: true
        });
        if (!result.current)
            throw new BotApiError(
                502,
                'INVALID_RESPONSE',
                '시즌 전환 결과를 확인할 수 없어요. /시즌으로 다시 열어 주세요.'
            );
        panel.result = result;
        await interaction.editReply(completed(panel));
    } finally {
        panel.busy = false;
    }
}
