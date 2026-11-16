import assert from 'node:assert/strict';
import test from 'node:test';
import { ComponentType, MessageFlags } from 'discord.js';
import type { Interaction, ModalBuilder } from 'discord.js';
import type { BotCreateScrimInput } from '../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../src/api/client.ts';
import { creationModal, ScrimCreationForms, submitScrimCreation } from '../src/interactions/create-scrim.ts';
import { createInteractionHandler } from '../src/interactions/router.ts';
import { GUILD, SCRIM, USER } from './fixtures.ts';

const origin = new URL('https://monkeybot.example');
const originalId = '970000000000000800';
type Draft = {
    title: string;
    scheduledAt: string;
    teamCount: string;
    reserveCapacity: string;
    hardFearless: string;
};
const draft: Draft = {
    title: '금요일 내전',
    scheduledAt: '',
    teamCount: '2',
    reserveCapacity: '0',
    hardFearless: 'false'
};

function interaction(
    kind: 'command' | 'modal' | 'button',
    customId = '',
    values: Draft = draft,
    actorId = USER
) {
    const replies: unknown[] = [];
    const modals: ModalBuilder[] = [];
    const value = {
        id: kind === 'command' ? originalId : '970000000000000801',
        commandName: '내전모집',
        customId,
        guildId: GUILD,
        user: { id: actorId },
        deferred: false,
        replied: false,
        isAutocomplete: () => false,
        isChatInputCommand: () => kind === 'command',
        isButton: () => kind === 'button',
        isStringSelectMenu: () => false,
        isModalSubmit: () => kind === 'modal',
        isRepliable: () => true,
        fields: {
            getTextInputValue: (key: keyof Draft) => values[key],
            getStringSelectValues: (key: keyof Draft) => [values[key]]
        },
        deferReply: async (options: unknown) => {
            assert.deepEqual(options, { flags: MessageFlags.Ephemeral });
            value.deferred = true;
        },
        showModal: async (modal: ModalBuilder) => {
            modals.push(modal);
            value.replied = true;
        },
        reply: async (reply: unknown) => {
            replies.push(reply);
            value.replied = true;
        },
        editReply: async (reply: unknown) => {
            replies.push(reply);
        },
        followUp: async () => assert.fail('모달 결과는 기존 응답을 갱신한다.')
    };
    return { value: value as unknown as Interaction, replies, modals };
}

test('내전모집은 즉시 네이티브 입력창을 열고 팀·대기·피어리스를 선택으로 제공한다', async () => {
    const request = interaction('command');
    await createInteractionHandler({} as BotApi, origin)(request.value);
    assert.equal(request.replies.length, 0);
    const modal = request.modals[0]!.toJSON();
    assert.equal(modal.components.length, 5);
    assert.ok(modal.components.every((component) => component.type === ComponentType.Label));
    const fields = modal.components
        .filter((component) => component.type === ComponentType.Label)
        .map((component) => component.component);
    assert.deepEqual(
        fields.map((field) => field.type),
        [4, 4, 3, 3, 3]
    );
    const choices = fields.filter((field) => field.type === ComponentType.StringSelect);
    assert.deepEqual(
        choices.map((field) =>
            field.options.filter((option) => option.default).map((option) => option.value)
        ),
        [['2'], ['0'], ['false']]
    );
});

test('모달 제출은 KST·선택을 변환하고 최초 명령의 멱등 키를 사용하며 완료한 화면은 다시 생성하지 않는다', async () => {
    const calls: { guild: string; input: BotCreateScrimInput }[] = [];
    const handler = createInteractionHandler(
        {
            createScrim: async (guild: string, input: BotCreateScrimInput) => {
                calls.push({ guild, input });
                return { scrimId: SCRIM };
            }
        } as BotApi,
        origin
    );
    const command = interaction('command');
    await handler(command.value);
    const customId = command.modals[0]!.data.custom_id!;
    const values = {
        title: '  주말 내전  ',
        scheduledAt: '2026-11-20 20:30',
        teamCount: '4',
        reserveCapacity: '2',
        hardFearless: 'true'
    };
    const submitted = interaction('modal', customId, values);
    await handler(submitted.value);
    assert.deepEqual(calls, [
        {
            guild: GUILD,
            input: {
                actorId: USER,
                interactionId: originalId,
                title: '주말 내전',
                scheduledAt: '2026-11-20T11:30:00.000Z',
                teamCount: 4,
                reserveCapacity: 2,
                hardFearless: true
            }
        }
    ]);
    assert.ok(JSON.stringify(submitted.replies).includes(`/g/${GUILD}/scrims/${SCRIM}`));
    await handler(interaction('modal', customId, values).value);
    assert.equal(calls.length, 1);
});

test('입력 오류와 일시적 API 오류 뒤 초안을 수정해도 같은 생성 요청으로 재시도한다', async () => {
    const calls: BotCreateScrimInput[] = [];
    const handler = createInteractionHandler(
        {
            createScrim: async (_guild: string, input: BotCreateScrimInput) => {
                calls.push(input);
                if (calls.length === 1)
                    throw new BotApiError(503, 'API_UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
                return { scrimId: SCRIM };
            }
        } as BotApi,
        origin
    );
    const command = interaction('command');
    await handler(command.value);
    const customId = command.modals[0]!.data.custom_id!;
    const invalid = interaction('modal', customId, { ...draft, scheduledAt: '2026-02-29 20:00' });
    await handler(invalid.value);
    assert.equal(calls.length, 0);
    assert.match(JSON.stringify(invalid.replies), /실제 달력/);
    const reopen = interaction('button', customId.replace('scrim-create:', 'scrim-create:edit:'));
    await handler(reopen.value);
    assert.ok(JSON.stringify(reopen.modals[0]!.toJSON()).includes('2026-02-29 20:00'));
    const failed = interaction('modal', customId);
    await handler(failed.value);
    assert.match(JSON.stringify(failed.replies), /입력 수정/);
    await handler(interaction('modal', customId).value);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0]!.interactionId, originalId);
});

test('다른 사용자·만료·재시작 전 작성 화면은 생성 API에 접근하지 않는다', async () => {
    let now = 0;
    const forms = new ScrimCreationForms(() => now);
    const form = forms.create(USER, GUILD, originalId);
    const api = {
        createScrim: async () => assert.fail('만료되거나 다른 사용자의 화면이다.')
    } as unknown as BotApi;
    const submit = async (request: ReturnType<typeof interaction>, store = forms) => {
        await submitScrimCreation(
            request.value as Parameters<typeof submitScrimCreation>[0],
            api,
            origin,
            store
        );
        assert.match(JSON.stringify(request.replies), /만료/);
    };
    await submit(interaction('modal', 'scrim-create:' + form.id, draft, '970000000000000099'));
    await submit(interaction('modal', 'scrim-create:' + form.id), new ScrimCreationForms());
    now = 10 * 60_000;
    await submit(interaction('modal', 'scrim-create:' + form.id));
    assert.equal(creationModal({ ...form, draft }).toJSON().components.length, 5);
});
