import assert from 'node:assert/strict';
import test from 'node:test';
import { ButtonStyle, ComponentType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotApi } from '../src/api/client.ts';
import { handleCommand } from '../src/commands/scrims.ts';
import { renderRecruitment } from '../src/messages/recruitment.ts';
import { renderEntry } from '../src/messages/entry.ts';
import { renderMatch } from '../src/messages/match.ts';
import { renderConfirmation } from '../src/messages/confirmation.ts';
import { publication } from './fixtures.ts';
import type { BotPosition } from '../../../shared/bot-api.js';

const origin = new URL('https://monkeybot.example');

interface MessageComponent {
    type: number;
    content?: string;
    disabled?: boolean;
    divider?: boolean;
    label?: string;
    style?: number;
    url?: string;
    custom_id?: string;
    components?: readonly MessageComponent[];
}

function messageComponents(components: readonly MessageComponent[]): MessageComponent[] {
    return components.flatMap((component) => [component, ...messageComponents(component.components ?? [])]);
}

test('선발 정원이 차도 신청할 수 있고 모집 마감 후에는 웹 링크만 활성화한다', () => {
    const job = publication();
    job.data.selected = 10;
    const actions = [
        'registration',
        'registration-standby',
        'registration-withdraw',
        'manual-registration:open'
    ];
    for (const closed of [false, true]) {
        job.data.status = closed ? 'preparing' : 'recruit';
        const value = renderRecruitment(job, origin);
        const parts = messageComponents(value.components.map((component) => component.toJSON()));
        const buttons = parts.filter((part) => part.type === ComponentType.Button);
        const links = buttons.filter((button) => button.url);
        assert.equal(links.length, 1);
        assert.ok(!links[0]!.disabled);
        const controls = buttons.filter((button) => button.custom_id);
        assert.deepEqual(
            controls.map((button) => button.custom_id).sort(),
            actions.map((action) => `${action}:${job.scrimId}`).sort()
        );
        assert.ok(controls.every((button) => Boolean(button.disabled) === closed));
        if (!closed) {
            const text = parts.map((part) => part.content).join('\n');
            assert.match(text, /모집 중/);
            assert.match(text, /선발 10\/10/);
            assert.match(text, /대기/);
            assert.match(text, /<t:/);
            assert.deepEqual(value.allowedMentions, { parse: [] });
        }
    }
});

function matchJob(kind: 'lineup' | 'result') {
    const job = publication({ kind, subjectId: '60000000-0000-4000-8000-000000000001' });
    job.data.match = {
        id: '70000000-0000-4000-8000-000000000001',
        label: '결승',
        gameNumber: 2,
        bestOf: 3,
        teamAName: '포로',
        teamBName: '칼날부리',
        blueTeamName: '칼날부리',
        redTeamName: '포로',
        scoreA: 2,
        scoreB: 0,
        winnerSide: kind === 'result' ? 'red' : null,
        seriesWinnerName: kind === 'result' ? '포로' : null,
        players: Array.from({ length: 10 }, (_, index) => ({
            name: '*'.repeat(100),
            position: (['top', 'jungle', 'mid', 'bot', 'support'] as const)[index % 5]!,
            side: kind === 'result' ? (index < 5 ? ('blue' as const) : ('red' as const)) : null,
            teamSlot: index < 5 ? ('b' as const) : ('a' as const),
            champion: 'Ahri',
            kills: index,
            deaths: null,
            assists: 0
        }))
    };
    return job;
}

test('모든 게시·DM 웹 링크는 목적지를 밝히고 참가 버튼은 Discord 안에서 처리한다', () => {
    const job = publication();
    const messages = [
        [renderRecruitment(job, origin), `/g/${job.guildId}/scrims/${job.scrimId}`],
        [renderEntry({ ...job, kind: 'entry' }, origin), `/g/${job.guildId}/scrims/${job.scrimId}/bracket`],
        [renderConfirmation({ ...job, kind: 'confirmation_dm' }, origin), null],
        [renderMatch(matchJob('lineup'), origin), null],
        [renderMatch(matchJob('result'), origin), null]
    ] as const;
    for (const [message, pathname] of messages) {
        const components = messageComponents(message.components.map((component) => component.toJSON()));
        const links = components.filter((component) => component.url);
        assert.ok(links.length);
        for (const link of links) {
            assert.equal(link.style, ButtonStyle.Link);
            assert.match(link.label!, /^웹에서 /);
            const target = new URL(link.url!);
            assert.equal(target.origin, origin.origin);
            assert.ok(target.pathname.startsWith(`/g/${job.guildId}/`));
            if (pathname) {
                assert.equal(target.pathname, pathname);
                assert.equal(target.searchParams.get('publication'), job.id);
            }
            assert.equal(target.searchParams.has('token'), false);
        }
    }
    const buttons = messageComponents(messages[0][0].components.map((component) => component.toJSON()));
    const join = buttons.filter((button) => button.label === '참가하기');
    assert.equal(join.length, 1);
    assert.equal(join[0]!.style, ButtonStyle.Primary);
    assert.equal(join[0]!.custom_id, `registration:${job.scrimId}`);
    assert.equal(join[0]!.url, undefined);
});

test('목록·초기설정 명령의 웹 버튼도 해당 서버 목적지를 유지한다', async () => {
    for (const [commandName, label, suffix] of [
        ['내전목록', '웹에서 내전 목록 보기', 'scrims'],
        ['초기설정', '웹에서 서버 관리', 'admin']
    ]) {
        const replies: { components: { toJSON(): MessageComponent }[] }[] = [];
        const job = publication();
        const interaction = {
            commandName,
            guildId: job.guildId,
            user: { id: '970000000000000011' },
            id: '970000000000000101',
            deferReply: async () => {},
            editReply: async (reply: (typeof replies)[number]) => {
                replies.push(reply);
            }
        } as unknown as ChatInputCommandInteraction;
        await handleCommand(
            interaction,
            { initialize: async () => ({ membersSynced: 3 }) } as unknown as BotApi,
            origin
        );
        const links = messageComponents(replies[0]!.components.map((component) => component.toJSON())).filter(
            (component) => component.url
        );
        assert.equal(links.length, 1);
        assert.equal(links[0]!.label, label);
        assert.equal(links[0]!.url, `${origin.origin}/g/${job.guildId}/${suffix}`);
    }
});

test('확정 라인업은 실제 팀별 출전자만 표시하고 경기 진영·결과를 추정하지 않는다', () => {
    const job = matchJob('lineup');
    const value = renderMatch(job, origin);
    const json = JSON.stringify(value);
    assert.match(json, /### 칼날부리/);
    assert.match(json, /### 포로/);
    assert.match(json, /결승 · BO3/);
    assert.doesNotMatch(json, /2세트/);
    assert.doesNotMatch(json, /블루|레드|승리|Ahri|희망/);
    assert.match(json, new RegExp('publication=' + job.id));
});

test('결과 카드는 실제 승자·시리즈 점수·ROFL KDA를 한도 안에서 표현한다', () => {
    const job = matchJob('result');
    const value = renderMatch(job, origin);
    const json = JSON.stringify(value);
    assert.match(json, /포로 승리/);
    assert.match(json, /포로 2 : 0 칼날부리/);
    assert.match(json, /Ahri · 0\/—\/0/);
    assert.match(json, /시리즈 승자 · 포로/);
    const parts = messageComponents(value.components.map((component) => component.toJSON()));
    assert.ok(parts.some((part) => part.type === ComponentType.Separator && part.divider));
    assert.ok(parts.reduce((sum, part) => sum + (part.content?.length ?? 0), 0) <= 4000);
    assert.ok(parts.length <= 40);
    assert.deepEqual(value.allowedMentions, { parse: [] });
});

test('참가 안내 DM은 내전 안내와 일정만 보여주며 수신자 추적용 복구 링크를 유지한다', () => {
    const job = publication({ kind: 'confirmation_dm' });
    job.data.participants = [{ name: '다른 참가자 비공개', status: 'selected', positions: ['mid'] }];
    const json = JSON.stringify(renderConfirmation(job, origin));
    assert.match(json, /참가가 확정됐어요/);
    assert.match(json, /<t:/);
    assert.match(json, new RegExp('publication=' + job.id));
    assert.doesNotMatch(json, /다른 참가자 비공개|custom_id/);
});

test('최대 인원과 긴 이름에도 Discord 글·버튼 길이 제한을 만족한다', () => {
    const job = publication();
    job.data.title = '*'.repeat(50);
    job.data.teamCount = 4;
    job.data.capacity = 30;
    job.data.selected = 20;
    job.data.standby = 10;
    job.data.participants = Array.from({ length: 30 }, (_, index) => ({
        name: '*'.repeat(120),
        status: index < 20 ? ('selected' as const) : ('standby' as const),
        positions: ['top', 'jungle', 'mid', 'bot', 'support'] as BotPosition[]
    }));
    const value = renderRecruitment(job, origin);
    const json = value.components.map((component) => component.toJSON());
    const parts = messageComponents(json);
    assert.ok(parts.reduce((sum, part) => sum + (part.content?.length ?? 0), 0) <= 4000);
    assert.ok(parts.length <= 40);
    assert.match(JSON.stringify(json), /`01\.`/);
    const controls = json[1] as { components: { custom_id?: string }[] };
    assert.ok(
        controls.components.every((component) => !component.custom_id || component.custom_id.length <= 100)
    );
});

test('엔트리는 확정 팀원과 실제 저장된 포지션만 표시한다', () => {
    const job = publication({ kind: 'entry' });
    job.data.teams = [
        {
            name: '1팀',
            players: [
                { name: '선수', position: null },
                { name: '원딜', position: 'bot' }
            ]
        }
    ];
    const json = JSON.stringify(renderEntry(job, origin));
    assert.match(json, /웹에서 대진 보기/);
    assert.match(json, /원딜/);
    assert.doesNotMatch(json, /BLUE|RED|픽\/밴/);
});
