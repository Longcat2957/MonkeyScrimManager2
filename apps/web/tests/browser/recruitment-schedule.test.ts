import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationData } from '../../src/lib/server/discord/publication-data.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

test('새 모집의 한국 시각·설정 변경·명시적인 미정을 웹과 Discord에 같은 값으로 전달한다', async (t) => {
    const f = await createBrowserFixture(t, { width: 1280, userId: HTTP_IDS.manager });
    const { page } = f;
    const list = f.url + `/g/${HTTP_IDS.guild}/scrims`;
    const title = '모집 일정 경계 검증';
    await page.clock.setFixedTime(new Date('2026-11-19T23:45:59+09:00'));
    await page.goto(list);
    await page.getByRole('button', { name: '모집 만들기', exact: true }).click();
    const create = page.getByRole('dialog', { name: '모집 만들기', exact: true });
    assert.equal(await create.getByLabel('날짜', { exact: true }).inputValue(), '2026/11/20');
    assert.equal(await create.getByLabel('시각', { exact: true }).inputValue(), '00:15');
    await create.getByLabel('제목', { exact: true }).fill(title);
    await create.getByRole('button', { name: '만들기', exact: true }).click();
    await page.waitForURL(`${list}/*`);
    const scrimId = new URL(page.url()).pathname.split('/').at(-1)!;
    const row = page.getByRole('link', { name: new RegExp(title) });
    const verify = async (iso: string | null, label: string) => {
        await page.getByText(label, { exact: true }).waitFor();
        const notice = await f.db.transaction((tx) => publicationData(tx, scrimId));
        assert.equal(notice.scheduledAt, iso);
        await page.goto(list);
        if (iso) assert.equal(await row.locator('time').getAttribute('datetime'), iso);
        else await row.getByText('미정', { exact: true }).waitFor();
        await row.click();
    };
    await verify('2026-11-19T15:15:00.000Z', '11/20(금) 00:15');

    await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+09:00'));
    const settings = page.getByRole('dialog', { name: '내전 설정 수정', exact: true });
    const date = settings.getByLabel('날짜', { exact: true });
    const time = settings.getByLabel('시각', { exact: true });
    const save = settings.getByRole('button', { name: '저장', exact: true });
    const edit = async () => {
        await page.getByRole('button', { name: '운영 메뉴', exact: true }).click();
        await page.getByRole('menuitem', { name: '내전 설정 수정', exact: true }).click();
    };
    await edit();
    assert.equal(await time.inputValue(), '00:15');
    await date.fill('20261121');
    await time.fill('');
    await save.click();
    await settings.getByText('시각도 입력해 주세요', { exact: true }).waitFor();
    assert.equal(await date.inputValue(), '2026/11/21');
    await time.fill('20:30');
    await save.click();
    await settings.waitFor({ state: 'hidden' });
    await verify('2026-11-21T11:30:00.000Z', '11/21(토) 20:30');

    await edit();
    await date.fill('');
    await time.fill('');
    await save.click();
    await settings.waitFor({ state: 'hidden' });
    await verify(null, '일정 미정');
    await edit();
    assert.equal(await date.inputValue(), '');
    assert.equal(await time.inputValue(), '');
});
