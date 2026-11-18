import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';
import { sessionContext } from './support/browser.ts';

test('운영자는 세트 진영을 정하고 출전자는 실제 진영을 확인해 기록한다', { timeout: 60_000 }, async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const fixture = await createHttpMatchResultFixture(t);
    await fixture.confirm();
    const url = fixture.url + fixture.path;
    const manager = await browser.newContext();
    const participant = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await sessionContext(manager, fixture, fixture.manager.cookie);
    await sessionContext(participant, fixture, fixture.participant.cookie);
    const editor = await manager.newPage();
    const page = await participant.newPage();
    await editor.goto(url);
    const configure = editor.getByRole('button', { name: '진영 설정', expanded: false });
    const select = editor.getByRole('combobox', { name: '예정 블루 팀' });
    const save = editor.getByRole('button', { name: '진영 저장' });
    const planB = '블루 2팀 · 레드 1팀';
    await configure.waitFor();
    assert.equal(await select.count(), 0);
    await configure.press('Enter');
    await select.selectOption('b');
    await save.click();
    await editor.getByText(planB, { exact: true }).waitFor();
    await configure.waitFor();
    assert.equal(await select.count(), 0);

    await page.goto(url);
    await page.getByText(planB, { exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: '예정 블루 팀' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '진영 설정' }).count(), 0);
    await page.getByRole('button', { name: 'ROFL 업로드', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'ROFL 업로드' });
    await dialog.getByRole('radio', { name: '2팀', checked: true }).waitFor();
    const file = fixture.file();
    await dialog.locator('input[type=file]').setInputFiles({
        name: file.name,
        mimeType: file.type,
        buffer: Buffer.from(await file.arrayBuffer())
    });
    const submit = dialog.getByRole('button', { name: '업로드', exact: true });
    assert.equal(await submit.isDisabled(), true);
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('radio', { name: '1팀' }).check();
    await dialog.getByRole('checkbox', { name: /블루 1팀 · 레드 2팀/, checked: false }).waitFor();
    assert.equal(await submit.isDisabled(), true);
    await dialog.getByRole('checkbox').check();
    await submit.click();
    await dialog.getByText('1세트로 기록했어요', { exact: false }).waitFor();
    const [game] = await fixture.db.select().from(schema.games);
    assert.equal(game?.blueTeamSlot, 'a');
    await dialog.getByRole('button', { name: '닫기' }).click();
    await page.getByRole('heading', { name: '2세트 예정 진영' }).waitFor();
    await page.getByRole('region', { name: '2세트 예정 진영' }).getByText('미정', { exact: true }).waitFor();
    await editor.reload();
    await configure.click();
    await select.selectOption('b');
    await save.click();
    await editor.getByText(planB, { exact: true }).waitFor();
    await page.reload();
    await page.getByRole('region', { name: '2세트 예정 진영' }).getByText(planB, { exact: true }).waitFor();

    // 다른 운영자의 변경은 이미 확인한 파일·세트에 새 진영이나 revision을 덮어쓰지 않는다.
    await page.getByRole('button', { name: 'ROFL 업로드', exact: true }).click();
    const nextFile = fixture.file(1_900_000);
    await dialog.locator('input[type=file]').setInputFiles({
        name: nextFile.name,
        mimeType: nextFile.type,
        buffer: Buffer.from(await nextFile.arrayBuffer())
    });
    await dialog.getByRole('checkbox', { name: /블루 2팀 · 레드 1팀/ }).check();
    await configure.click();
    await select.selectOption('a');
    await save.click();
    await editor.getByText('블루 1팀 · 레드 2팀', { exact: true }).waitFor();
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/upload'));
    await submit.click();
    assert.equal((await response).status(), 409);
    await dialog.getByText('닫으면 현재 경기 상태를 다시 확인해요.').waitFor();
    assert.equal((await fixture.db.select().from(schema.games)).length, 1);
});
