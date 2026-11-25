import assert from 'node:assert/strict';
import test from 'node:test';
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

function standbyModal(time: string) {
    const request = interaction(`standby-time:${SCRIM}`);
    const value = Object.assign(request.value, {
        fields: { getTextInputValue: () => time }
    }) as unknown as ModalSubmitInteraction;
    return { value, replies: request.replies };
}

test('대기 신청은 즉시 모달을 열고 한국 날짜·시각과 예약 좌석을 확인한 뒤에만 저장한다', async () => {
    const forms = new RegistrationForms();
    const open = interaction(`registration-standby:${SCRIM}`);
    await handleRegistration(open.value, {} as BotApi, forms);
    assert.match(JSON.stringify(open.replies), new RegExp(`"custom_id":"standby-time:${SCRIM}"`));
    assert.match(JSON.stringify(open.replies), /참가 가능 시각/);
    const availableAt = '2099-02-28T15:15:00.000Z';
    for (const [status, previous] of [
        [null, null],
        ['selected', null],
        ['standby', null],
        ['standby', '2099-02-28T16:00:00.000Z']
    ] as const) {
        const original = registrationContext({
            registration: status
                ? {
                      id: REGISTRATION,
                      status,
                      riotAccountId: ACCOUNT,
                      positions: ['mid'],
                      availableAt: previous
                  }
                : null
        });
        const calls: BotRegistrationInput[] = [];
        const api = {
            registration: async () => original,
            saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
                calls.push(input);
                return registrationContext({
                    registration: {
                        id: REGISTRATION,
                        status: 'standby',
                        riotAccountId: ACCOUNT,
                        positions: ['mid'],
                        availableAt
                    }
                });
            }
        } as unknown as BotApi;
        const submitted = standbyModal('2099-03-01 00:15');
        await submitStandbyTime(submitted.value, api, forms);
        const confirmation = JSON.stringify(submitted.replies);
        assert.match(confirmation, /2099-03-01 00:15 KST/);
        assert.match(confirmation, /한 자리/);
        assert.equal(calls.length, 0);
        const id = confirmation.match(/form:[0-9a-f]{24}:standby/)![0];
        const confirmed = interaction(id);
        await handleRegistration(confirmed.value, api, forms);
        assert.deepEqual(calls, [
            {
                action: 'standby',
                actorId: USER,
                interactionId: confirmed.value.id,
                availableAt,
                ...(status
                    ? { registrationId: REGISTRATION }
                    : {
                          riotAccountId: ACCOUNT,
                          positions: ['top', 'jungle', 'mid', 'bot', 'support']
                      })
            }
        ]);
        assert.match(JSON.stringify(confirmed.replies), /2099-03-01 00:15 KST 자동 선발 예약/);
    }
});

test('시각을 비우면 예약 없이 수동 배정을 기다리며 기존 예약은 자리 반납을 확인한다', async () => {
    for (const previous of [null, '2099-03-01T01:00:00.000Z']) {
        const forms = new RegistrationForms();
        const current = registrationContext({
            registration: previous
                ? {
                      id: REGISTRATION,
                      status: 'standby',
                      riotAccountId: ACCOUNT,
                      positions: ['mid'],
                      availableAt: previous
                  }
                : null
        });
        const calls: BotRegistrationInput[] = [];
        const api = {
            registration: async () => current,
            saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
                calls.push(input);
                return registrationContext({
                    registration: {
                        id: REGISTRATION,
                        status: 'standby',
                        riotAccountId: ACCOUNT,
                        positions: ['mid'],
                        availableAt: null
                    }
                });
            }
        } as unknown as BotApi;
        const submitted = standbyModal('');
        await submitStandbyTime(submitted.value, api, forms);
        const confirmation = JSON.stringify(submitted.replies);
        assert.match(confirmation, /수동 배정 대기 확정/);
        assert.equal(confirmation.includes('자리를 반납'), !!previous);
        const confirmed = interaction(confirmation.match(/form:[0-9a-f]{24}:standby/)![0]);
        await handleRegistration(confirmed.value, api, forms);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.action, 'standby');
        assert.ok(!Object.hasOwn(calls[0]!, 'availableAt'));
        assert.equal(calls[0]!.registrationId, previous ? REGISTRATION : undefined);
        assert.match(JSON.stringify(confirmed.replies), /수동 배정 대기 중/);
    }
});

test('참가 버튼은 기존 대기자를 승격하지 않고 본인 예약 상태만 보여준다', async () => {
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
        assert.match(
            JSON.stringify(request.replies),
            availableAt ? /2099-03-01 00:15 KST/ : /수동 배정 대기/
        );
    }
});

test('잘못된 날짜·과거·날짜 없는 시각은 업무 API 호출 없이 거절한다', async () => {
    for (const [text, message] of [
        ['2099-02-29 22:00', /실제 날짜/],
        ['2099-03-01 25:00', /날짜와 시각/],
        ['00:15', /날짜와 시각/],
        ['2020-03-01 00:15', /현재보다 늦은/]
    ] as const) {
        const submitted = standbyModal(text);
        await submitStandbyTime(submitted.value, {} as BotApi, new RegistrationForms());
        assert.match(JSON.stringify(submitted.replies), message);
    }
});

test('확인 버튼을 누르기 전에 지난 시각은 예약하지 않는다', async () => {
    const forms = new RegistrationForms();
    const form = forms.create(USER, GUILD, registrationContext());
    form.pendingStandbyAt = '2020-01-01T00:00:00.000Z';
    const confirm = interaction(`form:${form.id}:standby`);
    await handleRegistration(confirm.value, {} as BotApi, forms);
    assert.match(JSON.stringify(confirm.replies), /시각을 다시 입력/);
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
    await submitStandbyTime(submitted.value, api, new RegistrationForms());
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
    await submitStandbyTime(standbyModal('').value, api, new RegistrationForms());
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
