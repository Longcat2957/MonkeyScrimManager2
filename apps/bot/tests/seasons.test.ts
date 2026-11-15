import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction, Interaction } from 'discord.js';
import type { BotRotateSeasonInput, BotSeason, BotSeasonSnapshot } from '../../../shared/bot-api.js';
import { BotApiError, createApiClient, type BotApi } from '../src/api/client.ts';
import { commands } from '../src/commands/definitions.ts';
import { handleAutocomplete, handleCommand } from '../src/commands/scrims.ts';
import { createInteractionHandler } from '../src/interactions/router.ts';
import { GUILD, USER } from './fixtures.ts';

const CURRENT = '60000000-0000-4000-8000-000000000001';
const PREVIOUS = '60000000-0000-4000-8000-000000000002';
const NEXT = '60000000-0000-4000-8000-000000000003';
const INTERACTION = '970000000000000800';
const origin = new URL('https://monkeybot.example');

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
        completed: [
            season({
                id: PREVIOUS,
                name: '지난 가을 시즌',
                startedAt: '2026-09-01T00:00:00.000Z',
                endedAt: '2026-11-01T00:00:00.000Z'
            })
        ]
    };
}

type Options = { name?: string | null; current?: string | null; confirm?: boolean | null };
function interaction(options: Options = {}, guildId: string | null = GUILD) {
    const replies: unknown[] = [];
    const deferred: unknown[] = [];
    const value = {
        id: INTERACTION,
        commandName: '시즌',
        guildId,
        user: { id: USER },
        deferred: false,
        replied: false,
        options: {
            getString: (key: string) => (key === '이름' ? options.name : options.current) ?? null,
            getBoolean: () => options.confirm ?? null
        },
        deferReply: async (reply: unknown) => {
            deferred.push(reply);
            value.deferred = true;
        },
        editReply: async (reply: unknown) => {
            replies.push(reply);
        },
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        isRepliable: () => true
    };
    return { value: value as unknown as ChatInputCommandInteraction, replies, deferred };
}

function autocomplete(query: string, field = '현재시즌', guildId: string | null = GUILD) {
    const replies: { name: string; value: string }[][] = [];
    return {
        value: {
            guildId,
            commandName: '시즌',
            user: { id: USER },
            options: { getFocused: () => ({ name: field, value: query }) },
            respond: async (choices: { name: string; value: string }[]) => {
                replies.push(choices);
            }
        } as unknown as AutocompleteInteraction,
        replies
    };
}

test('시즌 명령은 조회를 위해 옵션이 없을 수 있고 전환에는 이름·현재 시즌·확인이 구분된다', () => {
    const definition = commands.find((command) => command.name === '시즌')!.toJSON();
    const options = definition.options!;
    assert.equal(options.length, 3);
    assert.ok(options.every((option) => !option.required));
    const name = options.find((option) => option.name === '이름')!;
    assert.equal(name.type, ApplicationCommandOptionType.String);
    assert.ok('max_length' in name && name.max_length === 100);
    assert.ok('min_length' in name && name.min_length === 1);
    const current = options.find((option) => option.name === '현재시즌')!;
    assert.ok('autocomplete' in current && current.autocomplete === true);
    assert.equal(
        options.find((option) => option.name === '전환확인')!.type,
        ApplicationCommandOptionType.Boolean
    );
});

test('시즌 client는 실행자·선택 시즌·interaction을 인증된 GET/POST로 전달하고 자동완성만 2초로 제한한다', async (t) => {
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
    await api.seasons(GUILD, USER, true);
    const input = {
        actorId: USER,
        interactionId: INTERACTION,
        expectedCurrentSeasonId: CURRENT,
        name: '다음 시즌',
        confirm: true
    };
    await api.rotateSeason(GUILD, input);
    assert.deepEqual(
        calls.map((call) => call.method),
        ['GET', 'GET', 'POST']
    );
    assert.ok(calls.every((call) => call.url.pathname === `/internal/bot/guilds/${GUILD}/seasons`));
    assert.equal(calls[0]!.url.searchParams.get('actorId'), USER);
    assert.equal(calls[0]!.body, undefined);
    assert.deepEqual(calls[2]!.body, input);
    assert.deepEqual(deadlines, [10_000, 2000, 10_000]);
});

test('옵션 없는 시즌 조회는 관리자 API를 읽고 현재·과거 이름을 비공개로 보여 주며 ID를 노출하지 않는다', async () => {
    const calls: string[][] = [];
    const request = interaction();
    await handleCommand(
        request.value,
        {
            seasons: async (...args: string[]) => {
                calls.push(args);
                return snapshot();
            },
            rotateSeason: async () => assert.fail('조회는 시즌을 전환하지 않는다.')
        } as unknown as BotApi,
        origin
    );
    assert.deepEqual(calls, [[GUILD, USER]]);
    assert.deepEqual(request.deferred, [{ flags: MessageFlags.Ephemeral }]);
    const json = JSON.stringify(request.replies);
    assert.match(json, /현재 겨울 시즌/);
    assert.match(json, /지난 가을 시즌/);
    assert.ok(!json.includes(CURRENT) && !json.includes(PREVIOUS));
    assert.deepEqual((request.replies[0] as { allowedMentions: unknown }).allowedMentions, { parse: [] });
});

test('시즌이 없으면 초기 설정 안내를 한 번 제공하고 서버 밖에서는 API를 호출하지 않는다', async () => {
    const empty = interaction();
    await handleCommand(
        empty.value,
        { seasons: async () => ({ current: null, completed: [] }) } as unknown as BotApi,
        origin
    );
    assert.equal(JSON.stringify(empty.replies).split('/초기설정').length - 1, 1);
    const outside = interaction({}, null);
    await handleCommand(outside.value, {} as BotApi, origin);
    assert.match(JSON.stringify(outside.replies), /서버 안/);
});

test('긴 과거 시즌 목록은 종료 시즌 전체를 첨부하고 본문·파일 어디에도 UUID를 표시하지 않는다', async () => {
    const completed = Array.from({ length: 60 }, (_, index) =>
        season({
            id: `old-id-${index}`,
            name: `${index}번째 ${'긴 시즌 이름😀'.repeat(8)}`,
            endedAt: '2026-11-01T00:00:00.000Z'
        })
    );
    const request = interaction();
    await handleCommand(
        request.value,
        { seasons: async () => ({ current: season(), completed }) } as unknown as BotApi,
        origin
    );
    const reply = request.replies[0] as { files: { attachment: Buffer; name: string }[] };
    assert.equal(reply.files.length, 1);
    assert.equal(reply.files[0]!.name, 'monkeybot-seasons.txt');
    const text = reply.files[0]!.attachment.toString('utf8');
    assert.equal(text.split('\n').length, 60);
    assert.ok(text.includes('0번째') && text.includes('59번째'));
    assert.ok(!text.includes('old-id-'));
    assert.ok(!JSON.stringify(request.replies).includes(CURRENT));
});

for (const [options, message] of [
    [{ name: '   ', current: CURRENT, confirm: true }, /1~100자/],
    [{ name: '가'.repeat(101), current: CURRENT, confirm: true }, /1~100자/],
    [{ name: '다음 시즌', confirm: true }, /자동완성/],
    [{ name: '다음 시즌', current: '현재 겨울 시즌', confirm: true }, /자동완성/],
    [{ name: '다음 시즌', current: CURRENT, confirm: false }, /전환확인/],
    [{ name: '다음 시즌', current: CURRENT }, /전환확인/]
] as [Options, RegExp][])
    test(`부분·미확인 시즌 전환은 POST하지 않는다: ${String(message)}`, async () => {
        const request = interaction(options);
        await handleCommand(request.value, {} as BotApi, origin);
        assert.match(JSON.stringify(request.replies), message);
    });

test('명시적 전환은 입력 이름을 trim하고 선택 ID·실행자·interaction을 한 번만 전달한다', async () => {
    const calls: { guild: string; input: BotRotateSeasonInput }[] = [];
    const request = interaction({ name: '  새 봄 시즌  ', current: CURRENT, confirm: true });
    await handleCommand(
        request.value,
        {
            seasons: async () => assert.fail('선택 시즌을 새 조회 값으로 바꾸지 않는다.'),
            rotateSeason: async (guild: string, input: BotRotateSeasonInput) => {
                calls.push({ guild, input });
                return { current: season({ id: NEXT, name: input.name }), completed: snapshot().completed };
            }
        } as unknown as BotApi,
        origin
    );
    assert.deepEqual(calls, [
        {
            guild: GUILD,
            input: {
                actorId: USER,
                interactionId: INTERACTION,
                expectedCurrentSeasonId: CURRENT,
                name: '새 봄 시즌',
                confirm: true
            }
        }
    ]);
    assert.match(JSON.stringify(request.replies), /새 봄 시즌/);
    assert.match(JSON.stringify(request.replies), /기존 내전과 전적의 시즌은 바뀌지/);
    assert.ok(!JSON.stringify(request.replies).includes(NEXT));
});

test('오래된 현재 시즌·권한 회수 오류는 기존 router로 안내하고 자동 재조회·재전송하지 않는다', async (t) => {
    t.mock.method(console, 'error', () => {});
    for (const [status, code, message] of [
        [409, 'CONFLICT', '현재 시즌이 바뀌었어요. 다시 조회해 주세요.'],
        [403, 'FORBIDDEN', '서버 관리자만 사용할 수 있어요.']
    ] as const) {
        let calls = 0;
        const request = interaction({ name: '새 시즌', current: CURRENT, confirm: true });
        const api = {
            seasons: async () => assert.fail('오류 뒤 선택 시즌을 자동으로 바꾸지 않는다.'),
            rotateSeason: async () => {
                calls++;
                throw new BotApiError(status, code, message);
            }
        } as unknown as BotApi;
        await createInteractionHandler(api, origin)(request.value as unknown as Interaction);
        assert.equal(calls, 1);
        assert.ok(JSON.stringify(request.replies).includes(message));
    }
});

test('현재 시즌 자동완성은 이름만 표시하고 현재 UUID만 value로 전달하며 과거 시즌은 제시하지 않는다', async () => {
    const calls: unknown[][] = [];
    const api = {
        seasons: async (...args: unknown[]) => {
            calls.push(args);
            return snapshot();
        }
    } as unknown as BotApi;
    const focused = autocomplete('겨울');
    await handleAutocomplete(focused.value, api);
    assert.deepEqual(calls, [[GUILD, USER, true]]);
    assert.deepEqual(focused.replies, [[{ name: '현재 겨울 시즌', value: CURRENT }]]);
    const unmatched = autocomplete('가을');
    await handleAutocomplete(unmatched.value, api);
    assert.deepEqual(unmatched.replies, [[]]);
    const noCurrent = autocomplete('');
    await handleAutocomplete(noCurrent.value, {
        seasons: async () => ({ current: null, completed: snapshot().completed })
    } as unknown as BotApi);
    assert.deepEqual(noCurrent.replies, [[]]);
});

test('시즌 자동완성의 잘못된 문맥·권한 오류는 비어 있고 예상하지 못한 오류는 숨기지 않는다', async () => {
    for (const focused of [autocomplete('', '이름'), autocomplete('', '현재시즌', null)]) {
        await handleAutocomplete(focused.value, {} as BotApi);
        assert.deepEqual(focused.replies, [[]]);
    }
    const denied = autocomplete('');
    await handleAutocomplete(denied.value, {
        seasons: async () => {
            throw new BotApiError(403, 'FORBIDDEN', '권한 없음');
        }
    } as unknown as BotApi);
    assert.deepEqual(denied.replies, [[]]);
    const unexpected = new Error('예상하지 못한 오류');
    await assert.rejects(
        handleAutocomplete(autocomplete('').value, {
            seasons: async () => {
                throw unexpected;
            }
        } as unknown as BotApi),
        (error) => error === unexpected
    );
});
