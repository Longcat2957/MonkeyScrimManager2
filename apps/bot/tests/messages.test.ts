import assert from 'node:assert/strict';
import test from 'node:test';
import { renderRecruitment } from '../src/messages/recruitment.ts';
import { renderEntry } from '../src/messages/entry.ts';
import { publication } from './fixtures.ts';
import type { BotPosition } from '../../../shared/bot-api.js';

const origin = new URL('https://monkeybot.example');

test('선발 정원이 차도 모집 카드의 내 신청 버튼을 유지한다', () => {
    const job = publication();
    job.data.selected = 10;
    const value = renderRecruitment(job, origin);
    const controls = value.components[1]!.toJSON();
    assert.equal('components' in controls && controls.components.length, 2);
    assert.match(JSON.stringify(controls), /내 신청/);
    assert.match(JSON.stringify(value), /<t:/);
    assert.deepEqual(value.allowedMentions, { parse: [] });
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
    const text = json[0] as { components: { content: string }[] };
    assert.ok(text.components[0]!.content.length <= 4000);
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
