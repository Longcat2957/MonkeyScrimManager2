import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags } from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import type { BotRotateSeasonInput, BotSeason, BotSeasonSnapshot } from '../../../shared/bot-api.js';
import { BotApiError, createApiClient, type BotApi } from '../src/api/client.ts';
import {
    handleSeasonButton,
    openSeasonPanel,
    SeasonPanels,
    seasonNameModal,
    submitSeasonName
} from '../src/interactions/seasons.ts';
import { GUILD, USER } from './fixtures.ts';

const CURRENT = '60000000-0000-4000-8000-000000000001';
const PREVIOUS = '60000000-0000-4000-8000-000000000002';
const NEXT = '60000000-0000-4000-8000-000000000003';
const INTERACTION = '970000000000000800';

function season(patch: Partial<BotSeason> = {}): BotSeason {
    return {
        id: CURRENT,
        name: '현재 겨울 시즌',
        startedAt: '2026-11-01T00:00:00.000Z',
        endedAt: null,
        ...patch
    };
}
function snapshot(): BotSeasonSnapshot {
    return {
        current: season(),
        completed: [season({ id: PREVIOUS, name: '지난 가을 시즌', endedAt: '2026-11-01T00:00:00.000Z' })]
    };
}
function interaction(customId = '', actorId = USER, guildId: string | null = GUILD, name = ' 새 봄 시즌 ') {
    const replies: unknown[] = [],
        modals: unknown[] = [],
        deferred: unknown[] = [];
    const value = {
        id: INTERACTION,
        guildId,
        user: { id: actorId },
        customId,
        fields: { getTextInputValue: () => name },
        deferReply: async (reply: unknown) => {
            deferred.push(reply);
        },
        deferUpdate: async () => {},
        reply: async (reply: unknown) => {
            replies.push(reply);
        },
        editReply: async (reply: unknown) => {
            replies.push(reply);
        },
        showModal: async (modal: unknown) => {
            modals.push(modal);
        }
    };
    return { value, replies, modals, deferred };
}
const asButton = (request: ReturnType<typeof interaction>) => request.value as unknown as ButtonInteraction;
const asModal = (request: ReturnType<typeof interaction>) =>
    request.value as unknown as ModalSubmitInteraction;

test('시즌 client는 실행자·선택 시즌·interaction을 인증된 GET/POST로 전달한다', async (t) => {
    const deadlines: number[] = [];
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
        deadlines.push(milliseconds);
        return new AbortController().signal;
    });
    const calls: { url: URL; method: string; body: unknown }[] = [];
    const api = createApiClient({
        origin: new URL('http://127.0.0.1:3000'),
        token: 'fixture',
        fetch: async (url, init) => {
            assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture');
            assert.equal(init?.redirect, 'error');
            calls.push({
                url: new URL(String(url)),
                method: init!.method!,
                body: init?.body ? JSON.parse(String(init.body)) : undefined
            });
            return Response.json(snapshot());
        }
    });
    await api.seasons(GUILD, USER);
    const input: BotRotateSeasonInput = {
        actorId: USER,
        interactionId: INTERACTION,
        expectedCurrentSeasonId: CURRENT,
        name: '다음 시즌',
        confirm: true
    };
    await api.rotateSeason(GUILD, input);
    assert.deepEqual(
        calls.map((call) => call.method),
        ['GET', 'POST']
    );
    assert.ok(calls.every((call) => call.url.pathname === `/internal/bot/guilds/${GUILD}/seasons`));
    assert.equal(calls[0]!.url.searchParams.get('actorId'), USER);
    assert.deepEqual(calls[1]!.body, input);
    assert.deepEqual(deadlines, [10_000, 10_000]);
});

test('시즌 패널은 현재·과거를 구분선으로 나누어 비공개로 보여 주고 이름 입력 버튼을 제공한다', async () => {
    const panels = new SeasonPanels();
    const calls: string[][] = [];
    const request = interaction();
    await openSeasonPanel(
        request.value as unknown as ChatInputCommandInteraction,
        {
            seasons: async (...args: string[]) => {
                calls.push(args);
                return snapshot();
            }
        } as unknown as BotApi,
        panels
    );
    assert.deepEqual(calls, [[GUILD, USER]]);
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    const json = JSON.stringify(request.replies);
    assert.match(json, /현재 겨울 시즌/);
    assert.match(json, /지난 가을 시즌/);
    assert.match(json, /새 시즌 시작/);
    assert.ok(!json.includes(CURRENT) && !json.includes(PREVIOUS));
    assert.match(json, /"type":14/);
});

test('과거 시즌은 페이지로 모두 조회하며 서버 밖·빈 시즌에는 불필요한 입력 버튼을 보이지 않는다', async () => {
    const panels = new SeasonPanels();
    const history = Array.from({ length: 20 }, (_, index) =>
        season({ name: `과거 ${index}`, endedAt: '2026-11-01T00:00:00Z' })
    );
    const panel = panels.create(USER, GUILD, { current: season(), completed: history });
    for (const page of [1, 2]) {
        const request = interaction(`season:next:${panel.id}`);
        await handleSeasonButton(asButton(request), {} as BotApi, panels);
        assert.equal(panel.page, page);
        assert.match(JSON.stringify(request.replies), new RegExp(`과거 ${page * 8}`));
    }
    const empty = interaction();
    await openSeasonPanel(
        empty.value as unknown as ChatInputCommandInteraction,
        { seasons: async () => ({ current: null, completed: [] }) } as unknown as BotApi,
        panels
    );
    assert.equal(JSON.stringify(empty.replies).split('/초기설정').length - 1, 1);
    assert.doesNotMatch(JSON.stringify(empty.replies), /새 시즌 시작/);
    const outside = interaction('', USER, null);
    await openSeasonPanel(outside.value as unknown as ChatInputCommandInteraction, {} as BotApi, panels);
    assert.match(JSON.stringify(outside.replies), /서버 안/);
});

test('새 시즌 버튼은 이름 모달을 열고 제출은 전환 전 확인 화면만 보여 준다', async () => {
    const panels = new SeasonPanels();
    const panel = panels.create(USER, GUILD, snapshot());
    const request = interaction(`season:new:${panel.id}`);
    await handleSeasonButton(asButton(request), {} as BotApi, panels);
    assert.equal(request.modals.length, 1);
    const modal = seasonNameModal(panel).toJSON();
    assert.equal(modal.components.length, 1);
    const submitted = interaction(`season:name:${panel.id}`);
    await submitSeasonName(asModal(submitted), {} as BotApi, panels);
    assert.equal(panel.name, '새 봄 시즌');
    assert.match(JSON.stringify(submitted.replies), /현재 겨울 시즌/);
    assert.match(JSON.stringify(submitted.replies), /새 봄 시즌/);
    assert.match(JSON.stringify(submitted.replies), /시즌 전환/);
});

test('확인 버튼에서만 최초 시즌과 확인 interaction을 보내며 중복 확인은 전환을 반복하지 않는다', async () => {
    const panels = new SeasonPanels();
    const panel = panels.create(USER, GUILD, snapshot());
    await submitSeasonName(asModal(interaction(`season:name:${panel.id}`)), {} as BotApi, panels);
    const calls: BotRotateSeasonInput[] = [];
    const api = {
        rotateSeason: async (guild: string, input: BotRotateSeasonInput) => {
            assert.equal(guild, GUILD);
            calls.push(input);
            return { current: season({ id: NEXT, name: input.name }), completed: [] };
        }
    } as unknown as BotApi;
    const confirm = () => asButton(interaction(`season:confirm:${panel.id}:${panel.version}`));
    await handleSeasonButton(confirm(), api, panels);
    await handleSeasonButton(confirm(), api, panels);
    assert.deepEqual(calls, [
        {
            actorId: USER,
            interactionId: INTERACTION,
            expectedCurrentSeasonId: CURRENT,
            name: '새 봄 시즌',
            confirm: true
        }
    ]);
});

test('취소·이름 변경·작성자나 서버 위조·만료·재시작은 이전 확인으로 전환하지 않는다', async () => {
    let now = 0;
    const panels = new SeasonPanels(() => now);
    const panel = panels.create(USER, GUILD, snapshot());
    await submitSeasonName(asModal(interaction(`season:name:${panel.id}`)), {} as BotApi, panels);
    const oldVersion = panel.version;
    await handleSeasonButton(asButton(interaction(`season:back:${panel.id}`)), {} as BotApi, panels);
    assert.equal(panel.name, '');
    for (const request of [
        interaction(`season:confirm:${panel.id}:${oldVersion}`),
        interaction(`season:new:${panel.id}`, '970000000000000999'),
        interaction(`season:new:${panel.id}`, USER, '970000000000000888')
    ]) {
        await handleSeasonButton(asButton(request), {} as BotApi, panels);
        assert.match(JSON.stringify(request.replies), /화면/);
    }
    now = 600001;
    const expired = interaction(`season:new:${panel.id}`);
    await handleSeasonButton(asButton(expired), {} as BotApi, panels);
    assert.match(JSON.stringify(expired.replies), /만료/);
    assert.equal(new SeasonPanels().get(panel.id, USER, GUILD), null);
});

test('잘못된 이름은 전환하지 않고 권한 회수·오래된 시즌 오류는 자동 재조회나 전환 재시도를 하지 않는다', async () => {
    for (const name of [' ', '가'.repeat(101)]) {
        const panels = new SeasonPanels();
        const panel = panels.create(USER, GUILD, snapshot());
        const request = interaction(`season:name:${panel.id}`, USER, GUILD, name);
        await submitSeasonName(asModal(request), {} as BotApi, panels);
        assert.match(JSON.stringify(request.replies), /1~100자/);
        assert.equal(panel.name, '');
    }
    for (const status of [403, 409]) {
        const panels = new SeasonPanels();
        const panel = panels.create(USER, GUILD, snapshot());
        await submitSeasonName(asModal(interaction(`season:name:${panel.id}`)), {} as BotApi, panels);
        let calls = 0;
        const error = new BotApiError(status, status === 403 ? 'FORBIDDEN' : 'CONFLICT', '전환 실패');
        await assert.rejects(
            handleSeasonButton(
                asButton(interaction(`season:confirm:${panel.id}:${panel.version}`)),
                {
                    rotateSeason: async () => {
                        calls++;
                        throw error;
                    }
                } as unknown as BotApi,
                panels
            ),
            (cause) => cause === error
        );
        assert.equal(calls, 1);
        assert.equal(panel.result, null);
    }
});
