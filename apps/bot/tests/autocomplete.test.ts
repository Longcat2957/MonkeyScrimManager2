import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutocompleteInteraction } from 'discord.js';
import type { BotFailedPublication } from '../../../shared/bot-api.js';
import { BotApiError, type BotApi } from '../src/api/client.ts';
import { handleAutocomplete } from '../src/commands/scrims.ts';
import { GUILD, SCRIM, USER } from './fixtures.ts';

function publication(patch: Partial<BotFailedPublication> = {}): BotFailedPublication {
    return {
        id: '40000000-0000-4000-8000-000000000001',
        scrimId: SCRIM,
        title: '금요일 내전',
        targetLabel: '1세트 · 결승 · 포로팀 vs 바위게팀',
        kind: 'result',
        state: 'blocked',
        channelId: null,
        messageId: null,
        errorCode: 'MISSING_ACCESS',
        ...patch
    };
}

function interaction(query: string, guildId: string | null = GUILD, commandName = '게시복구') {
    const replies: { name: string; value: string }[][] = [];
    return {
        value: {
            guildId,
            commandName,
            user: { id: USER },
            options: { getFocused: () => query },
            respond: async (choices: { name: string; value: string }[]) => replies.push(choices)
        } as unknown as AutocompleteInteraction,
        replies
    };
}

test('자동완성은 서버 검색 결과를 제목으로 다시 거르지 않는다', async () => {
    const calls: string[][] = [];
    const api = {
        failedPublications: async (...args: string[]) => {
            calls.push(args);
            return { publications: [publication({ targetLabel: '2세트 · 결승 · 포로팀 vs 바위게팀' })] };
        }
    } as unknown as BotApi;
    const focused = interaction('2세트');
    await handleAutocomplete(focused.value, api);
    assert.deepEqual(calls, [[GUILD, USER, '2세트']]);
    assert.equal(focused.replies[0]?.length, 1);
    assert.match(focused.replies[0]![0]!.name, /2세트/);
    assert.match(focused.replies[0]![0]!.name, /금요일 내전/);
});

test('같은 내전의 세트·취소 결과·출전 명단·DM을 서로 구분해서 표시한다', async () => {
    const rows = [
        publication(),
        publication({ targetLabel: '2세트 · 결승 · 포로팀 vs 바위게팀' }),
        publication({ targetLabel: '취소 결과 · 1세트 · 결승 · 포로팀 vs 바위게팀' }),
        publication({ kind: 'lineup', targetLabel: '준결승 A · 포로팀 vs 칼날부리팀' }),
        publication({ kind: 'lineup', targetLabel: '준결승 B · 돌거북팀 vs 바위게팀' }),
        publication({ kind: 'confirmation_dm', targetLabel: '받는 사람 A' }),
        publication({ kind: 'confirmation_dm', targetLabel: '받는 사람 B', state: 'uncertain' }),
        publication({ kind: 'recruitment', targetLabel: null })
    ].map((row, index) => ({ ...row, id: String(index) }));
    const api = { failedPublications: async () => ({ publications: rows }) } as unknown as BotApi;
    const focused = interaction('');
    await handleAutocomplete(focused.value, api);
    const choices = focused.replies[0]!;
    assert.equal(new Set(choices.map((choice) => choice.name)).size, rows.length);
    assert.deepEqual(
        choices.map((choice) => choice.value),
        rows.map((row) => row.id)
    );
    assert.ok(choices.every((choice) => choice.name.length <= 100 && choice.name.includes('금요일 내전')));
    assert.match(choices[6]!.name, /전달 불명/);
    assert.match(choices[7]!.name, /모집/);
});

test('100자 제한에서도 경기·세트·상태와 긴 내전 제목의 일부를 유지한다', async () => {
    const title = '긴내전제목을구분하는앞부분입니다'.repeat(6);
    const targetLabel = '취소 결과 · 2세트 · 준결승 A · ' + '아주긴팀명😀'.repeat(15);
    const api = {
        failedPublications: async () => ({ publications: [publication({ title, targetLabel })] })
    } as unknown as BotApi;
    const focused = interaction('');
    await handleAutocomplete(focused.value, api);
    const name = focused.replies[0]![0]!.name;
    assert.ok(name.length <= 100);
    assert.match(name, /경기 결과 · 게시 실패/);
    assert.match(name, /취소 결과 · 2세트 · 준결승 A/);
    assert.ok(name.includes(title.slice(0, 19)));
    assert.equal(Buffer.from(name).toString('utf8'), name);
});

test('잘못된 자동완성 문맥은 API를 호출하지 않고 빈 목록을 반환한다', async () => {
    const api = {
        failedPublications: async () => assert.fail('이 문맥에서는 API를 호출하지 않는다.')
    } as unknown as BotApi;
    for (const focused of [interaction('', null), interaction('', GUILD, '내전목록')]) {
        await handleAutocomplete(focused.value, api);
        assert.deepEqual(focused.replies, [[]]);
    }
});

test('자동완성 API 오류는 빈 목록으로 응답하고 예상하지 못한 오류는 숨기지 않는다', async () => {
    const focused = interaction('2세트');
    const api = {
        failedPublications: async () => {
            throw new BotApiError(403, 'FORBIDDEN', '권한이 없어요');
        }
    } as unknown as BotApi;
    await handleAutocomplete(focused.value, api);
    assert.deepEqual(focused.replies, [[]]);
    const unexpected = new Error('알 수 없는 오류');
    await assert.rejects(
        handleAutocomplete(interaction('').value, {
            failedPublications: async () => {
                throw unexpected;
            }
        } as unknown as BotApi),
        (error) => error === unexpected
    );
});
