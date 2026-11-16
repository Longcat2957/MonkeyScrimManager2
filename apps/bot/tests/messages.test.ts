import assert from 'node:assert/strict';
import test from 'node:test';
import { ComponentType } from 'discord.js';
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
    divider?: boolean;
    components?: readonly MessageComponent[];
}

function messageComponents(components: readonly MessageComponent[]): MessageComponent[] {
    return components.flatMap((component) => [component, ...messageComponents(component.components ?? [])]);
}

for (const kind of ['recruitment', 'entry'] as const) {
    test(`${kind} 링크는 게시 작업을 식별하고 기존 목적지를 유지한다`, () => {
        const job = publication({ kind });
        const rendered = kind === 'recruitment' ? renderRecruitment(job, origin) : renderEntry(job, origin);
        const row = rendered.components[kind === 'recruitment' ? 2 : 1]!.toJSON();
        assert.ok('components' in row);
        const button = row.components.find((component) => 'url' in component);
        assert.ok(button && 'url' in button && typeof button.url === 'string');
        const url = new URL(button.url);
        assert.equal(url.origin, origin.origin);
        assert.equal(
            url.pathname,
            `/g/${job.guildId}/scrims/${job.scrimId}${kind === 'entry' ? '/bracket' : ''}`
        );
        assert.equal(url.searchParams.get('publication'), job.id);
    });
}

test('선발 정원이 차도 참가·대기·취소 버튼을 독립적으로 제공하고 마감 후 직접 변경만 막는다', () => {
    const job = publication();
    job.data.selected = 10;
    const value = renderRecruitment(job, origin);
    const controls = value.components[1]!.toJSON();
    assert.ok('components' in controls);
    const registration = controls.components.find(
        (component) => 'custom_id' in component && component.custom_id === `registration:${job.scrimId}`
    );
    assert.ok(registration && (!('disabled' in registration) || !registration.disabled));
    assert.equal(controls.components.length, 3);
    const navigation = value.components[2]!.toJSON();
    assert.ok('components' in navigation);
    assert.equal(navigation.components.length, 2);
    assert.match(JSON.stringify(navigation), /내전 열기/);
    assert.match(JSON.stringify(navigation), /참가자 추가/);
    for (const action of ['standby', 'withdraw']) {
        assert.ok(
            controls.components.some(
                (component) =>
                    'custom_id' in component &&
                    component.custom_id === `registration-${action}:${job.scrimId}`
            )
        );
    }
    assert.match(JSON.stringify(controls), /참가하기/);
    assert.match(JSON.stringify(value), /<t:/);
    assert.deepEqual(value.allowedMentions, { parse: [] });
    const parts = messageComponents(value.components.map((component) => component.toJSON()));
    assert.equal(parts.filter((part) => part.type === ComponentType.Separator && part.divider).length, 2);
    const paragraphs = parts.filter((part) => part.type === ComponentType.TextDisplay);
    assert.match(paragraphs[0]!.content!, /모집 중/);
    assert.match(paragraphs[1]!.content!, /선발 10\/10/);
    assert.match(paragraphs[2]!.content!, /대기/);
    job.data.status = 'preparing';
    const closed = renderRecruitment(job, origin).components[1]!.toJSON();
    assert.ok('components' in closed);
    for (const action of ['standby', 'withdraw']) {
        const button = closed.components.find(
            (component) =>
                'custom_id' in component && component.custom_id === `registration-${action}:${job.scrimId}`
        );
        assert.ok(button && 'disabled' in button && button.disabled);
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
    assert.match(json, /대진 열기/);
    assert.match(json, /원딜/);
    assert.doesNotMatch(json, /BLUE|RED|픽\/밴/);
});
