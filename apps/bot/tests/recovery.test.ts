import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionRowBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    ModalBuilder,
    ModalSubmitInteraction
} from 'discord.js';
import type { BotFailedPublication, BotPublicationRetryInput } from '../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../src/api/client.ts';
import {
    handleRecoveryComponent,
    openRecoveryPanel,
    publicationChoiceName,
    recoveryMessageId,
    recoveryPanel,
    RecoveryForms,
    submitRecoveryModal
} from '../src/interactions/recovery.ts';
import { GUILD, SCRIM, USER } from './fixtures.ts';

const publicationId = '10000000-0000-4000-8000-000000000020';
const messageId = '970000000000000500';
const channelId = '970000000000000501';

function publication(overrides: Partial<BotFailedPublication> = {}): BotFailedPublication {
    return {
        id: publicationId,
        scrimId: SCRIM,
        title: '금요일 내전',
        targetLabel: '1경기 1세트',
        kind: 'result',
        state: 'uncertain',
        channelId,
        messageId: null,
        errorCode: null,
        ...overrides
    };
}

function request(
    customId = '',
    options: {
        actorId?: string;
        guildId?: string | null;
        interactionId?: string;
        values?: string[];
        text?: string;
    } = {}
) {
    const replies: unknown[] = [];
    const modals: ModalBuilder[] = [];
    const value = {
        customId,
        id: options.interactionId ?? '970000000000000800',
        user: { id: options.actorId ?? USER },
        guildId: options.guildId === undefined ? GUILD : options.guildId,
        values: options.values ?? [],
        fields: { getTextInputValue: () => options.text ?? '' },
        isStringSelectMenu: () => options.values !== undefined,
        deferReply: async (flags: unknown) => {
            assert.deepEqual(flags, { flags: MessageFlags.Ephemeral });
        },
        deferUpdate: async () => {},
        reply: async (reply: unknown) => {
            replies.push(reply);
        },
        editReply: async (reply: unknown) => {
            replies.push(reply);
        },
        showModal: async (modal: ModalBuilder) => {
            modals.push(modal);
        }
    };
    return {
        component: value as unknown as ButtonInteraction,
        command: value as unknown as ChatInputCommandInteraction,
        modal: value as unknown as ModalSubmitInteraction,
        replies,
        modals
    };
}

test('게시 복구는 개인 선택 화면을 열고 25개 제한 밖의 작업은 네이티브 검색창으로 찾는다', async () => {
    const items = Array.from({ length: 27 }, (_, index) =>
        publication({ id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000001` })
    );
    const calls: unknown[][] = [];
    const api = {
        failedPublications: async (...input: unknown[]) => {
            calls.push(input);
            return { publications: items };
        }
    } as unknown as BotApi;
    const forms = new RecoveryForms();
    const opened = request();
    await openRecoveryPanel(opened.command, api, forms);
    const panel = opened.replies[0] as ReturnType<typeof recoveryPanel>;
    const menu = panel.components
        .filter((component) => component instanceof ActionRowBuilder)
        .flatMap((component) => component.components)
        .find((component) => component instanceof StringSelectMenuBuilder)!;
    const choices = menu.toJSON();
    assert.equal(choices.options.length, 25);
    const formId = choices.custom_id.split(':')[1]!;
    const form = forms.get(formId, USER, GUILD)!;
    const search = request(`publication-recovery:${form.id}:search`);
    await handleRecoveryComponent(search.component, api, forms);
    assert.equal(search.modals[0]!.toJSON().components[0]!.type, 18);
    await submitRecoveryModal(
        request(search.modals[0]!.data.custom_id!, { text: '  [주말]%_  ' }).modal,
        api,
        forms
    );
    assert.deepEqual(calls, [
        [GUILD, USER],
        [GUILD, USER, '[주말]%_']
    ]);
    assert.equal(form.publications.length, 25);
    assert.equal(form.query, '[주말]%_');
    const noGuild = request('', { guildId: null });
    await openRecoveryPanel(noGuild.command, api, forms);
    assert.equal(calls.length, 2);
    assert.match(JSON.stringify(noGuild.replies), /서버 안/);
    assert.ok(
        publicationChoiceName(publication({ title: '🐒'.repeat(100), targetLabel: '🐒'.repeat(100) }))
            .length <= 100
    );
});

test('전달 불명 작업은 선택만으로 재전송하지 않으며 DM 부재 확인과 이중 클릭을 보호한다', async () => {
    const forms = new RecoveryForms();
    const form = forms.create(USER, GUILD, [
        publication({ kind: 'confirmation_dm', channelId: null, targetLabel: 'Longcat' })
    ]);
    const calls: BotPublicationRetryInput[] = [];
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const api = {
        retryPublication: async (_guild: string, _id: string, input: BotPublicationRetryInput) => {
            calls.push(input);
            await gate;
            return { ok: true };
        }
    } as unknown as BotApi;
    const component = async (action: string, values?: string[]) => {
        const sent = request(`publication-recovery:${form.id}:${action}`, { values });
        await handleRecoveryComponent(sent.component, api, forms);
        return sent;
    };
    const forged = await component('select', ['10000000-0000-4000-8000-000000000099']);
    assert.equal(form.selectedId, null);
    assert.match(JSON.stringify(forged.replies), /다시 선택/);
    await component('select', [publicationId]);
    await component('retry');
    assert.equal(calls.length, 0);
    const absent = await component('absent');
    assert.match(JSON.stringify(absent.replies), /수신자에게 참가 안내 DM이 없음을 확인/);
    assert.equal(calls.length, 0);
    const saving = component('confirm-absent');
    await Promise.resolve();
    const duplicate = await component('confirm-absent');
    assert.match(JSON.stringify(duplicate.replies), /처리하고 있어요/);
    finish();
    await saving;
    await component('confirm-absent');
    assert.deepEqual(calls, [{ actorId: USER, interactionId: '970000000000000800', confirmAbsent: true }]);
    assert.equal(form.completed, true);
});

test('기존 글 입력창은 선택한 작업에 묶이고 Discord 메시지 링크를 검증한 뒤 복구를 예약한다', async () => {
    const forms = new RecoveryForms();
    const otherId = '10000000-0000-4000-8000-000000000021';
    const form = forms.create(USER, GUILD, [publication(), publication({ id: otherId })]);
    form.selectedId = publicationId;
    const calls: BotPublicationRetryInput[] = [];
    const api = {
        retryPublication: async (_guild: string, _id: string, input: BotPublicationRetryInput) => {
            calls.push(input);
            return { ok: true };
        }
    } as unknown as BotApi;
    const opened = request(`publication-recovery:${form.id}:message`);
    await handleRecoveryComponent(opened.component, api, forms);
    const customId = opened.modals[0]!.data.custom_id!;
    assert.ok(customId.length <= 100);
    form.selectedId = otherId;
    const stale = request(customId, { text: messageId });
    await submitRecoveryModal(stale.modal, api, forms);
    assert.match(JSON.stringify(stale.replies), /다시 선택/);
    assert.equal(calls.length, 0);
    form.selectedId = publicationId;
    const link = `https://discord.com/channels/${GUILD}/${channelId}/${messageId}`;
    await submitRecoveryModal(request(customId, { text: link }).modal, api, forms);
    assert.deepEqual(calls, [{ actorId: USER, interactionId: '970000000000000800', messageId }]);
    assert.equal(recoveryMessageId(` ${messageId} `), messageId);
    assert.equal(recoveryMessageId(link.replace('discord.com', 'example.com')), null);
    assert.equal(recoveryMessageId('not-a-message'), null);
});

test('응답 유실 뒤에는 처음 복구한 대상·내용·멱등 키로만 재확인한다', async () => {
    const forms = new RecoveryForms();
    const form = forms.create(USER, GUILD, [publication({ state: 'blocked' })]);
    form.selectedId = publicationId;
    const calls: BotPublicationRetryInput[] = [];
    const api = {
        retryPublication: async (_guild: string, id: string, input: BotPublicationRetryInput) => {
            assert.equal(id, publicationId);
            calls.push(input);
            if (calls.length === 1) throw new BotApiError(503, 'API_UNAVAILABLE', '일시적인 오류예요.');
            return { ok: true };
        }
    } as unknown as BotApi;
    const send = async (action: string, interactionId: string) =>
        handleRecoveryComponent(
            request(`publication-recovery:${form.id}:${action}`, { interactionId }).component,
            api,
            forms
        );
    await send('retry', '970000000000000801');
    assert.ok(form.pending);
    await send('absent', '970000000000000802');
    await submitRecoveryModal(
        request(`publication-recovery:${form.id}:search`, { text: '다른 내전' }).modal,
        api,
        forms
    );
    assert.equal(calls.length, 1);
    assert.equal(form.query, '');
    await send('resend', '970000000000000803');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[1]!.interactionId, '970000000000000801');
    await send('retry', '970000000000000804');
    assert.equal(calls.length, 2);
});

test('다른 사용자·서버·만료·재시작 전 화면은 복구 API에 접근하지 않는다', async () => {
    let now = 0;
    const forms = new RecoveryForms(() => now);
    const form = forms.create(USER, GUILD, [publication({ state: 'blocked' })]);
    form.selectedId = publicationId;
    const customId = `publication-recovery:${form.id}:retry`;
    const api = {
        retryPublication: async () => assert.fail('화면의 실행자·서버·유효 기간을 확인해야 한다.')
    } as unknown as BotApi;
    for (const [sent, store] of [
        [request(customId, { actorId: '970000000000000099' }), forms],
        [request(customId, { guildId: '970000000000000002' }), forms],
        [request(customId), new RecoveryForms()]
    ] as const) {
        await handleRecoveryComponent(sent.component, api, store);
        assert.match(JSON.stringify(sent.replies), /만료/);
    }
    now = 10 * 60_000;
    const expired = request(customId);
    await handleRecoveryComponent(expired.component, api, forms);
    assert.match(JSON.stringify(expired.replies), /만료/);
});

test('서버가 복구 권한을 거절하면 오류를 보여주고 불확실한 재시도 상태로 남기지 않는다', async () => {
    const forms = new RecoveryForms();
    const form = forms.create(USER, GUILD, [publication({ state: 'blocked' })]);
    form.selectedId = publicationId;
    const api = {
        retryPublication: async () => {
            throw new BotApiError(403, 'FORBIDDEN', '운영자 권한이 필요해요.');
        }
    } as unknown as BotApi;
    const rejected = request(`publication-recovery:${form.id}:retry`);
    await handleRecoveryComponent(rejected.component, api, forms);
    assert.match(JSON.stringify(rejected.replies), /운영자 권한/);
    assert.equal(form.pending, null);
    assert.equal(form.completed, false);
});
