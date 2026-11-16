import assert from 'node:assert/strict';
import test from 'node:test';
import type { ButtonInteraction, UserSelectMenuInteraction } from 'discord.js';
import type { BotManualRegistrationContext, BotManualRegistrationInput } from '../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../src/api/client.ts';
import {
    handleManualRegistration,
    ManualRegistrationForms,
    manualRegistrationPanel
} from '../src/interactions/manual-registration.ts';
import { renderRecruitment } from '../src/messages/recruitment.ts';
import { GUILD, SCRIM, USER, publication } from './fixtures.ts';

const TARGET = '970000000000000012';
const context = (): BotManualRegistrationContext => ({
    guildId: GUILD,
    scrimId: SCRIM,
    title: '금요일 내전',
    canAdd: true,
    reason: null
});

function interaction(customId: string, values?: string[], userId = USER, guildId: string | null = GUILD) {
    const replies: unknown[] = [];
    const value = {
        customId,
        guildId,
        user: { id: userId },
        id: '970000000000000100',
        values: values ?? [],
        isButton: () => values === undefined,
        isUserSelectMenu: () => values !== undefined,
        deferReply: async () => {},
        deferUpdate: async () => {},
        reply: async (reply: unknown) => {
            replies.push(reply);
        },
        editReply: async (reply: unknown) => {
            replies.push(reply);
        }
    };
    return { value: value as unknown as ButtonInteraction | UserSelectMenuInteraction, replies };
}

test('모집 글은 운영자 수동 추가 버튼을 제공하고 개인 화면은 권한 조회 후 UserSelect를 연다', async () => {
    const message = renderRecruitment(
        publication({ data: { ...publication().data, formationMethod: 'auction' } }),
        new URL('https://monkeybot.test')
    );
    const messageJson = JSON.stringify(message);
    assert.match(messageJson, /참가자 추가/);
    assert.doesNotMatch(messageJson, /경매|수동 편성/);
    const forms = new ManualRegistrationForms();
    const request = interaction('manual-registration:open:' + SCRIM);
    const calls: string[][] = [];
    const api = {
        manualRegistration: async (...input: string[]) => {
            calls.push(input);
            return context();
        }
    } as unknown as BotApi;
    await handleManualRegistration(request.value, api, forms);
    assert.deepEqual(calls, [[GUILD, SCRIM, USER]]);
    assert.match(JSON.stringify(request.replies), /manual-registration:select:/);
    assert.doesNotMatch(JSON.stringify(request.replies), new RegExp(TARGET));
    await assert.rejects(
        handleManualRegistration(
            interaction('manual-registration:open:' + SCRIM).value,
            {
                manualRegistration: async () => {
                    throw new BotApiError(403, 'FORBIDDEN', '관리 권한이 없어요.');
                }
            } as unknown as BotApi,
            forms
        ),
        /관리 권한/
    );
});

test('멤버 선택은 즉시 서버에 맡기고 성공한 별명·선발 상태를 표시하며 정원이 차면 선택을 닫는다', async () => {
    const forms = new ManualRegistrationForms();
    const form = forms.create(USER, GUILD, context());
    const calls: BotManualRegistrationInput[] = [];
    const request = interaction(`manual-registration:select:${form.id}`, [TARGET]);
    await handleManualRegistration(
        request.value,
        {
            addParticipant: async (_guild: string, _scrim: string, input: BotManualRegistrationInput) => {
                calls.push(input);
                return {
                    context: { ...context(), canAdd: false, reason: '신청 정원이 찼어요.' },
                    participant: { name: '서버 별명', status: 'selected' }
                };
            }
        } as unknown as BotApi,
        forms
    );
    assert.deepEqual(calls, [{ actorId: USER, userId: TARGET, interactionId: '970000000000000100' }]);
    const json = JSON.stringify(request.replies);
    assert.match(json, /서버 별명/);
    assert.match(json, /선발로 추가/);
    assert.match(json, /정원이 찼어요/);
    assert.doesNotMatch(json, /manual-registration:select:/);
});

test('응답 유실 뒤 다른 멤버 선택을 막고 최초 대상과 요청 키로만 재확인한다', async () => {
    const forms = new ManualRegistrationForms();
    const form = forms.create(USER, GUILD, context());
    const calls: BotManualRegistrationInput[] = [];
    const api = {
        addParticipant: async (_guild: string, _scrim: string, input: BotManualRegistrationInput) => {
            calls.push({ ...input });
            if (calls.length === 1) throw new BotApiError(503, 'API_UNAVAILABLE', '결과를 확인할 수 없어요.');
            return { context: context(), participant: { name: '서버 별명', status: 'standby' } };
        }
    } as unknown as BotApi;
    await handleManualRegistration(
        interaction(`manual-registration:select:${form.id}`, [TARGET]).value,
        api,
        forms
    );
    assert.match(JSON.stringify(manualRegistrationPanel(form)), /같은 요청 다시 확인/);
    await handleManualRegistration(
        interaction(`manual-registration:select:${form.id}`, ['970000000000000999']).value,
        api,
        forms
    );
    assert.equal(calls.length, 1);
    const retry = interaction(`manual-registration:retry:${form.id}`);
    await handleManualRegistration(retry.value, api, forms);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(form.pending, null);
    assert.match(JSON.stringify(retry.replies), /대기로 추가/);
});

test('다른 실행자·서버·만료 화면과 잘못된 선택은 추가 API를 호출하지 않는다', async () => {
    let now = 100;
    const forms = new ManualRegistrationForms(() => now);
    const form = forms.create(USER, GUILD, context());
    let calls = 0;
    const api = {
        addParticipant: async () => {
            calls++;
            throw Error('호출되면 안 됨');
        }
    } as unknown as BotApi;
    for (const request of [
        interaction(`manual-registration:select:${form.id}`, [TARGET], TARGET),
        interaction(`manual-registration:select:${form.id}`, [TARGET], USER, '970000000000000099'),
        interaction(`manual-registration:select:${form.id}`, [])
    ])
        await handleManualRegistration(request.value, api, forms);
    now += 600_001;
    await handleManualRegistration(
        interaction(`manual-registration:select:${form.id}`, [TARGET]).value,
        api,
        forms
    );
    assert.equal(calls, 0);
});
