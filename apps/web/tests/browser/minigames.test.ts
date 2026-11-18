import assert from 'node:assert/strict';
import test from 'node:test';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

test('동전을 던지면 공중에서 양면이 보이고 표시한 결과로 착지한다', async (t) => {
    const { page, url } = await createBrowserFixture(t, { width: 1440 });
    await page.goto(`${url}/g/${HTTP_IDS.guild}`);
    await page.getByRole('button', { name: '미니게임', exact: true }).click();
    const game = page.getByRole('region', { name: '코인토스' });
    const face = game.locator('.coin');
    await game.getByRole('button', { name: '던지기', exact: true }).click();
    const visible = await face.evaluate((coin) => {
        const [flight] = coin.getAnimations();
        flight.pause();
        const duration = Number(flight.effect!.getTiming().duration);
        const faces = new Set<string>();
        for (let frame = 1; frame < 40; frame++) {
            flight.currentTime = (duration * frame) / 40;
            const { x, y, width, height } = coin.getBoundingClientRect();
            const side = document.elementFromPoint(x + width / 2, y + height / 2);
            if (side?.parentElement === coin) faces.add(side.textContent!);
        }
        flight.finish();
        return [...faces].sort();
    });
    assert.deepEqual(visible, ['H', 'T']);
    await game.getByRole('button', { name: '다시 던지기' }).waitFor();
    const landed = await face.evaluate((coin) => {
        const { x, y, width, height } = coin.getBoundingClientRect();
        return document.elementFromPoint(x + width / 2, y + height / 2)?.textContent;
    });
    assert.match((await game.getByRole('status').textContent())!, landed === 'H' ? /앞면/ : /뒷면/);
});

test('줄바꿈 명단을 붙여넣고 인원을 변경해도 입력과 한 판의 결과를 보존한다', async (t) => {
    const { page, url } = await createBrowserFixture(t, { width: 390 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${url}/g/${HTTP_IDS.guild}`);
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await page.getByRole('button', { name: '미니게임', exact: true }).click();
    await page.getByRole('button', { name: '사다리', exact: true }).click();
    const game = page.getByRole('region', { name: '사다리', exact: true });
    await game.getByLabel('참가 인원').selectOption('6');
    for (const side of ['참가자', '결과']) {
        const slots = await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
                game.getByLabel(`${side} ${i + 1}`, { exact: true }).boundingBox()
            )
        );
        assert.ok(
            slots.every((slot, i) => slot && (i === 0 || slot.x >= slots[i - 1]!.x + slots[i - 1]!.width))
        );
    }
    await game.getByLabel('참가 인원').selectOption('3');
    const first = game.getByLabel('참가자 1', { exact: true });
    await first.evaluate((input) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', '철수\n영희\n민수\n지수');
        input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    });
    const size = game.getByLabel('참가 인원');
    assert.equal(await size.inputValue(), '4');
    await size.selectOption('2');
    await size.selectOption('4');
    const last = game.getByLabel('참가자 4', { exact: true });
    assert.equal(await last.inputValue(), '지수');
    await last.press('Enter');
    const prize = game.getByLabel('결과 1', { exact: true });
    assert.ok(await prize.evaluate((el) => el === document.activeElement));
    await prize.fill('블루');
    await game.getByRole('button', { name: '사다리 시작' }).click();
    await game.getByRole('button', { name: '지수' }).click();
    const result = await game.getByRole('status').innerText();
    await game.getByText('전체 결과 보기').click();
    const outcomes = await game.locator('dd').allTextContents();
    assert.deepEqual(outcomes.toSorted(), ['블루', '꽝', '꽝', '꽝'].toSorted());
    assert.equal(result, `지수의 결과: ${outcomes[3]}`);
    await game.getByRole('button', { name: '다시 편집' }).click();
    assert.equal(await prize.inputValue(), '블루');
    assert.equal(await last.inputValue(), '지수');
});
