import assert from 'node:assert/strict';
import test from 'node:test';
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { BotApi } from '../src/api/client.ts';
import type { BotRegistrationInput } from '../../../shared/bot-api.js';
import {
    handleRegistration,
    parseFormId,
    RegistrationForms,
    renderForm
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
        registration: { id: REGISTRATION, status: 'selected', riotAccountId: ACCOUNT, positions: ['mid'] }
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

test('공개 대기·취소 버튼은 수정 화면 없이 신규 대기·기존 선발의 대기 전환·철회를 직접 요청한다', async () => {
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
                    status: input.action === 'withdraw' ? 'withdrawn' : 'standby',
                    riotAccountId: null,
                    positions: ['mid']
                }
            });
            return context;
        }
    } as unknown as BotApi;
    const first = interaction(`registration-standby:${SCRIM}`);
    await handleRegistration(first.value, api, forms);
    assert.equal(calls[0]!.action, 'standby');
    assert.equal(calls[0]!.riotAccountId, null);
    assert.equal(calls[0]!.positions?.length, 5);
    assert.equal(calls[0]!.registrationId, undefined);
    assert.doesNotMatch(JSON.stringify(first.replies), /희망 포지션 선택|수정하기|신청을 철회할까요/);
    context = registrationContext({
        registration: { id: REGISTRATION, status: 'selected', riotAccountId: ACCOUNT, positions: ['mid'] }
    });
    await handleRegistration(interaction(`registration-standby:${SCRIM}`).value, api, forms);
    assert.deepEqual(calls[1], {
        actorId: USER,
        interactionId: '970000000000000100',
        action: 'standby',
        registrationId: REGISTRATION
    });
    const cancel = interaction(`registration-withdraw:${SCRIM}`);
    await handleRegistration(cancel.value, api, forms);
    assert.deepEqual(calls[2], {
        actorId: USER,
        interactionId: '970000000000000100',
        action: 'withdraw',
        registrationId: REGISTRATION
    });
    assert.match(JSON.stringify(cancel.replies), /참가를 취소했어요/);
    assert.doesNotMatch(JSON.stringify(cancel.replies), /철회할까요/);
});

test('대기자가 참가를 누르면 기존 신청으로 선발 복귀를 요청하고 서버의 대기 유지 결과도 구분한다', async () => {
    for (const status of ['selected', 'standby'] as const) {
        const calls: BotRegistrationInput[] = [];
        const original = registrationContext({
            registration: { id: REGISTRATION, status: 'standby', riotAccountId: null, positions: ['mid'] }
        });
        const api = {
            registration: async () => original,
            saveRegistration: async (_guild: string, _scrim: string, input: BotRegistrationInput) => {
                calls.push(input);
                return registrationContext({ registration: { ...original.registration!, status } });
            }
        } as unknown as BotApi;
        const request = interaction(`registration:${SCRIM}`);
        await handleRegistration(request.value, api, new RegistrationForms());
        assert.deepEqual(calls, [
            {
                actorId: USER,
                interactionId: '970000000000000100',
                action: 'select',
                registrationId: REGISTRATION
            }
        ]);
        assert.match(
            JSON.stringify(request.replies),
            status === 'selected' ? /참가자로 복귀/ : /대기를 유지/
        );
        assert.doesNotMatch(JSON.stringify(request.replies), /수정하기/);
    }
});

test('공개 직접 버튼도 마감·미신청 철회·중복 대기는 쓰기 없이 현재 상태를 안내한다', async () => {
    let context = registrationContext({
        registration: { id: REGISTRATION, status: 'selected', riotAccountId: null, positions: ['mid'] },
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
    for (const action of ['standby', 'withdraw']) {
        const request = interaction(`registration-${action}:${SCRIM}`);
        await handleRegistration(request.value, api, new RegistrationForms());
        assert.match(JSON.stringify(request.replies), /마감/);
    }
    context = registrationContext();
    await handleRegistration(
        interaction(`registration-withdraw:${SCRIM}`).value,
        api,
        new RegistrationForms()
    );
    context = registrationContext({
        registration: { id: REGISTRATION, status: 'standby', riotAccountId: null, positions: ['mid'] }
    });
    await handleRegistration(
        interaction(`registration-standby:${SCRIM}`).value,
        api,
        new RegistrationForms()
    );
    assert.equal(calls, 0);
});
