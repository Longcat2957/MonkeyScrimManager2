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
        }
    } as unknown as BotApi;
    const reopened = interaction(`registration:${SCRIM}`);
    await handleRegistration(reopened.value, api, forms);
    assert.deepEqual(calls, [[GUILD, SCRIM, USER]]);
    assert.match(JSON.stringify(reopened.replies), /신청하기/);
    const expired = interaction('form:' + '0'.repeat(24) + ':submit');
    await handleRegistration(expired.value, api, forms);
    assert.match(JSON.stringify(expired.replies), /만료/);
    assert.equal(calls.length, 1);
});

test('타인의 폼 요청은 업무 API를 호출하지 않는다', async () => {
    const forms = new RegistrationForms();
    const form = forms.create(USER, GUILD, registrationContext());
    const fake = interaction(`form:${form.id}:submit`, undefined, '970000000000000999');
    await handleRegistration(fake.value, {} as BotApi, forms);
    assert.match(JSON.stringify(fake.replies), /만료/);
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
    assert.equal(last.components[0]!.options.length, 1);
    assert.equal(parseFormId(`form:${form.id}:next`)?.id, form.id);
});
