import assert from 'node:assert/strict';
import test from 'node:test';
import { ComponentType, ModalBuilder } from 'discord.js';
import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { BotApi } from '../src/api/client.ts';
import type { BotRegistrationInput } from '../../../shared/bot-api.js';
import {
    handleRegistration,
    parseFormId,
    RegistrationForms,
    renderForm,
    submitStandbyTime
} from '../src/interactions/registration.ts';
import { ACCOUNT, GUILD, REGISTRATION, registrationContext, SCRIM, USER } from './fixtures.ts';

function interaction(customId: string, values?: string[], actorId = USER) {
    const replies: unknown[] = [];
    const value = {
        customId,
        guildId: GUILD,
        user: { id: actorId },
        id: '970000000000000100',
        values: values ?? [],
        message: { components: [] },
        deferReply: async () => {},
        deferUpdate: async () => {},
        showModal: async (modal: unknown) => {
            replies.push(modal);
        },
        reply: async (reply: unknown) => {
            replies.push(reply);
        },
        editReply: async (reply: unknown) => {
            replies.push(reply);
        },
        isStringSelectMenu: () => values !== undefined
    };
    return { value: value as unknown as ButtonInteraction | StringSelectMenuInteraction, replies };
}

test('개인 폼은 실행자·서버·만료 시각에 묶인다', () => {
    let now = 1000;
    const forms = new RegistrationForms(() => now);
    const form = forms.create(USER, GUILD, registrationContext());
    assert.equal(forms.get(form.id, USER, GUILD), form);
    assert.equal(forms.get(form.id, '970000000000000999', GUILD), null);
    assert.equal(forms.get(form.id, USER, '970000000000000888'), null);
    now += 600_001;
    assert.equal(forms.get(form.id, USER, GUILD), null);
});

test('개인 입력 변경은 저장하지 않고 제출할 때만 신청한다', async () => {
    const forms = new RegistrationForms();
    const context = registrationContext();
    const form = forms.create(USER, GUILD, context);
    const calls: BotRegistrationInput[] = [];
    const api = {
        saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
            calls.push(input);
            return registrationContext({
                registration: {
                    id: REGISTRATION,
                    status: 'standby',
                    riotAccountId: ACCOUNT,
                    availableAt: null,
                    positions: ['bot', 'support']
                }
            });
        }
    } as unknown as BotApi;
    await handleRegistration(interaction(`form:${form.id}:positions`, ['bot', 'support']).value, api, forms);
    assert.equal(calls.length, 0);
    const submitted = interaction(`form:${form.id}:submit`);
    await handleRegistration(submitted.value, api, forms);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.action, 'create');
    assert.deepEqual(calls[0]!.positions, ['bot', 'support']);
    assert.match(JSON.stringify(submitted.replies), /대기/);
});

test('수정과 철회에는 폼을 열었을 때의 신청 ID를 전달하고 철회는 확인 후 처리한다', async () => {
    const forms = new RegistrationForms();
    const original = registrationContext({
        registration: {
            id: REGISTRATION,
            status: 'selected',
            riotAccountId: ACCOUNT,
            positions: ['mid'],
            availableAt: null
        }
    });
    const form = forms.create(USER, GUILD, original);
    const calls: BotRegistrationInput[] = [];
    const api = {
        saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
            calls.push(input);
            return input.action === 'withdraw'
                ? registrationContext({ registration: { ...original.registration!, status: 'withdrawn' } })
                : original;
        }
    } as unknown as BotApi;
    await handleRegistration(interaction(`form:${form.id}:submit`).value, api, forms);
    assert.equal(calls[0]!.action, 'update');
    assert.equal(calls[0]!.registrationId, REGISTRATION);
    await handleRegistration(interaction(`form:${form.id}:withdraw`).value, api, forms);
    assert.equal(calls.length, 1);
    await handleRegistration(interaction(`form:${form.id}:confirm`).value, api, forms);
    assert.equal(calls[1]!.action, 'withdraw');
    assert.equal(calls[1]!.registrationId, REGISTRATION);
});

test('봇 재시작으로 개인 폼이 없어져도 공개 내 신청 버튼에서 다시 조회한다', async () => {
    const forms = new RegistrationForms();
    const calls: string[][] = [];
    const api = {
        registration: async (...args: string[]) => {
            calls.push(args);
            return registrationContext();
        },
        saveRegistration: async () =>
            registrationContext({
                registration: {
                    id: REGISTRATION,
                    status: 'selected',
                    riotAccountId: ACCOUNT,
                    availableAt: null,
                    positions: ['mid']
                }
            })
    } as unknown as BotApi;
    const reopened = interaction(`registration:${SCRIM}`);
    await handleRegistration(reopened.value, api, forms);
    assert.deepEqual(calls, [[GUILD, SCRIM, USER]]);
    assert.match(JSON.stringify(reopened.replies), /신청했어요/);
    const expired = interaction('form:' + '0'.repeat(24) + ':submit');
    await handleRegistration(expired.value, api, forms);
    assert.match(JSON.stringify(expired.replies), /만료/);
    assert.match(JSON.stringify(expired.replies), /참가하기를 다시 눌러/);
    assert.equal(calls.length, 1);
});

test('타인의 폼 요청은 업무 API를 호출하지 않는다', async () => {
    const forms = new RegistrationForms();
    const form = forms.create(USER, GUILD, registrationContext());
    const fake = interaction(`form:${form.id}:submit`, undefined, '970000000000000999');
    await handleRegistration(fake.value, {} as BotApi, forms);
    assert.match(JSON.stringify(fake.replies), /만료/);
});

test('계정 없는 참가자도 버튼 한 번으로 신청하고 이후 상세 신청을 수정한다', async () => {
    const forms = new RegistrationForms();
    const calls: BotRegistrationInput[] = [];
    let context = registrationContext({ accounts: [] });
    const api = {
        registration: async () => context,
        saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
            calls.push(input);
            context = registrationContext({
                accounts: [],
                registration: {
                    id: REGISTRATION,
                    status: 'selected',
                    riotAccountId: null,
                    availableAt: null,
                    positions: input.positions!
                }
            });
            return context;
        }
    } as unknown as BotApi;
    const opened = interaction(`registration:${SCRIM}`);
    await handleRegistration(opened.value, api, forms);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.riotAccountId, null);
    assert.equal(calls[0]!.positions?.length, 5);
    assert.match(JSON.stringify(opened.replies), /수정하기/);
    assert.doesNotMatch(JSON.stringify(opened.replies), /https?:|auth\/discord/);
    await handleRegistration(interaction(`registration:${SCRIM}`).value, api, forms);
    assert.equal(calls.length, 1);
});

test('마감된 신청은 상태를 보여 주고 수정 조작은 제공하지 않는다', () => {
    const forms = new RegistrationForms();
    const form = forms.create(
        USER,
        GUILD,
        registrationContext({ status: 'preparing', canEdit: false, reason: '모집이 마감됐어요.' })
    );
    const result = renderForm(form);
    assert.equal(result.components.length, 1);
    assert.match(JSON.stringify(result), /마감/);
});

test('계정이 25개를 넘어도 페이지별로 모두 선택할 수 있다', async () => {
    const forms = new RegistrationForms();
    const form = forms.create(
        USER,
        GUILD,
        registrationContext({
            accounts: Array.from({ length: 26 }, (_, index) => ({
                id: 'account-' + index,
                label: 'Player' + index,
                isPrimary: index === 0
            }))
        })
    );
    let json = renderForm(form).components.map((component) => component.toJSON());
    const accountRow = json[1] as { components: { options: unknown[]; custom_id: string }[] };
    assert.equal(accountRow.components[0]!.options.length, 25);
    assert.ok(accountRow.components[0]!.custom_id.length <= 100);
    await handleRegistration(interaction(`form:${form.id}:next`).value, {} as BotApi, forms);
    json = renderForm(form).components.map((component) => component.toJSON());
    const last = json[1] as { components: { options: unknown[] }[] };
    assert.equal(last.components[0]!.options.length, 3);
    assert.equal(parseFormId(`form:${form.id}:next`)?.id, form.id);
});

const scheduledAt = '2099-02-28T14:45:00.000Z';
const start = Date.parse(scheduledAt);

function standbyModal(availableAt: string, startTime = start) {
    const request = interaction(`standby-time:${SCRIM}:${startTime}`);
    const value = Object.assign(request.value, {
        fields: {
            getTextInputValue: (id: string) => {
                assert.equal(id, 'availableAt');
                return availableAt;
            }
        }
    }) as unknown as ModalSubmitInteraction;
    return { value, replies: request.replies };
}

test('새 공지와 기존 공지 모두 버튼을 누른 한국 시각을 필수 입력칸 하나에 미리 채운다', async () => {
    for (const suffix of [':' + start, '']) {
        const open = interaction(`registration-standby:${SCRIM}${suffix}`);
        Object.assign(open.value, {
            createdTimestamp: Date.parse('2026-11-28T15:07:58Z'),
            message: {
                components: [
                    {
                        type: 17,
                        components: [{ type: 10, content: `## 내전\n<t:${start / 1000}:F>\n모집 중` }]
                    }
                ]
            }
        });
        await handleRegistration(open.value, {} as BotApi, new RegistrationForms());
        const [modal] = open.replies;
        assert.ok(modal instanceof ModalBuilder);
        const { components } = modal.toJSON();
        assert.equal(components.length, 1);
        const [label] = components;
        assert.ok(label?.type === ComponentType.Label);
        assert.match(label.description!, /2099-02-28 23:45/);
        assert.match(label.description!, /대기 명단.*합류 시각부터 선발 자리가 비면 자동으로 이동/);
        assert.ok(label.component.type === ComponentType.TextInput);
        assert.equal(label.component.custom_id, 'availableAt');
        assert.equal(label.component.required, true);
        assert.equal(label.component.value, '2026-11-29 00:07');
    }
});

test('신규·기존 신청 모두 사용자가 고친 한국 날짜와 시각을 합류 시각으로 저장한다', async () => {
    for (const [inputTime, availableAt, existing] of [
        ['2099-02-28 23:46', '2099-02-28T14:46:00.000Z', false],
        ['2099-03-01 00:15', '2099-02-28T15:15:00.000Z', true]
    ] as const) {
        const registration = {
            id: REGISTRATION,
            status: 'selected' as const,
            riotAccountId: ACCOUNT,
            positions: ['mid' as const],
            availableAt: null
        };
        const calls: BotRegistrationInput[] = [];
        const api = {
            registration: async () => registrationContext({ registration: existing ? registration : null }),
            saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
                calls.push(input);
                return registrationContext({
                    registration: { ...registration, status: 'standby', availableAt }
                });
            }
        } as unknown as BotApi;
        const submitted = standbyModal(inputTime);
        await submitStandbyTime(submitted.value, api);
        assert.deepEqual(calls, [
            {
                action: 'standby',
                actorId: USER,
                interactionId: submitted.value.id,
                expectedScheduledAt: scheduledAt,
                availableAt,
                ...(existing
                    ? { registrationId: REGISTRATION }
                    : { riotAccountId: ACCOUNT, positions: ['top', 'jungle', 'mid', 'bot', 'support'] })
            }
        ]);
        assert.match(JSON.stringify(submitted.replies), /합류 가능 · 선발 대기 중/);
    }
});

test('빈 값·형식 오류·과거·예정 시작 이하·일정 변경은 저장하지 않고 다시 입력하게 한다', async () => {
    const old = '2020-01-01T00:00:00.000Z';
    for (const [inputTime, scheduled, shown, error] of [
        ['', scheduledAt, start, /YYYY-MM-DD HH:mm/],
        ['30분', scheduledAt, start, /YYYY-MM-DD HH:mm/],
        ['2099-02-29 23:46', scheduledAt, start, /YYYY-MM-DD HH:mm/],
        ['2099-02-28 23:44', scheduledAt, start, /예정 시작.*보다 늦은/],
        ['2099-02-28 23:45', scheduledAt, start, /예정 시작.*보다 늦은/],
        ['2020-01-01 09:01', old, Date.parse(old), /이미 지난/],
        ['2099-03-01 00:15', scheduledAt, Date.parse(old), /시각이 변경/],
        ['2099-03-01 00:15', null, start, /정해지면/]
    ] as const) {
        const api = {
            registration: async () => registrationContext({ scheduledAt: scheduled })
        } as unknown as BotApi;
        const submitted = standbyModal(inputTime, shown);
        await submitStandbyTime(submitted.value, api);
        const result = JSON.stringify(submitted.replies);
        assert.match(result, error);
        assert.equal(result.includes('합류 시각 입력'), scheduled !== null);
    }
});

test('참가 버튼은 기존 대기자를 승격하지 않고 본인 신청 화면을 연다', async () => {
    for (const availableAt of [null, '2099-02-28T15:15:00.000Z']) {
        const original = registrationContext({
            registration: {
                id: REGISTRATION,
                status: 'standby',
                riotAccountId: null,
                positions: ['mid'],
                availableAt
            }
        });
        const api = { registration: async () => original } as unknown as BotApi;
        const request = interaction(`registration:${SCRIM}`);
        await handleRegistration(request.value, api, new RegistrationForms());
        const reply = JSON.stringify(request.replies);
        assert.match(reply, availableAt ? /2099-03-01 00:15 KST/ : /수동 배정 대기/);
        // 저장 API 없이 화면만 열고, 포지션 수정과 철회를 제공한다.
        assert.match(reply, /form:[0-9a-f]{24}:positions/);
        assert.match(reply, /수정하기/);
        assert.match(reply, /form:[0-9a-f]{24}:withdraw/);
    }
});

test('모집 마감·미신청 철회·동일 대기는 쓰기 없이 상태를 안내한다', async () => {
    let context = registrationContext({
        registration: {
            id: REGISTRATION,
            status: 'selected',
            riotAccountId: null,
            positions: ['mid'],
            availableAt: null
        },
        canEdit: false,
        reason: '모집이 마감됐어요.'
    });
    let calls = 0;
    const api = {
        registration: async () => context,
        saveRegistration: async () => {
            calls++;
            throw Error('호출되면 안 됨');
        }
    } as unknown as BotApi;
    const request = interaction(`registration-withdraw:${SCRIM}`);
    await handleRegistration(request.value, api, new RegistrationForms());
    assert.match(JSON.stringify(request.replies), /마감/);
    const submitted = standbyModal('');
    await submitStandbyTime(submitted.value, api);
    assert.match(JSON.stringify(submitted.replies), /마감/);
    context = registrationContext();
    await handleRegistration(
        interaction(`registration-withdraw:${SCRIM}`).value,
        api,
        new RegistrationForms()
    );
    context = registrationContext({
        registration: {
            id: REGISTRATION,
            status: 'standby',
            riotAccountId: null,
            positions: ['mid'],
            availableAt: null
        }
    });
    context.registration!.availableAt = new Date(start + 30 * 60_000).toISOString();
    const repeat = standbyModal('2099-03-01 00:15');
    await submitStandbyTime(repeat.value, api);
    assert.match(JSON.stringify(repeat.replies), /현재 상태/);
    assert.equal(calls, 0);
});

test('공개 철회 버튼은 기존 신청 ID로 즉시 취소한다', async () => {
    const current = registrationContext({
        registration: {
            id: REGISTRATION,
            status: 'standby',
            riotAccountId: null,
            positions: ['mid'],
            availableAt: '2099-03-01T01:00:00.000Z'
        }
    });
    const calls: BotRegistrationInput[] = [];
    const api = {
        registration: async () => current,
        saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
            calls.push(input);
            return registrationContext();
        }
    } as unknown as BotApi;
    const cancel = interaction(`registration-withdraw:${SCRIM}`);
    await handleRegistration(cancel.value, api, new RegistrationForms());
    assert.deepEqual(calls, [
        {
            actorId: USER,
            interactionId: cancel.value.id,
            action: 'withdraw',
            registrationId: REGISTRATION
        }
    ]);
    assert.match(JSON.stringify(cancel.replies), /참가를 취소했어요/);
});
