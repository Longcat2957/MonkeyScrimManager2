import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

const contactHref = 'mailto:schrodingers030@gmail.com';
const policyLinks = [
    { label: '문서', path: '/docs' },
    { label: '이용약관', path: '/terms' },
    { label: '개인정보 처리방침', path: '/privacy' }
];

async function footerContact(page: Page) {
    const footer = page.getByRole('contentinfo');
    assert.equal(await footer.count(), 1);
    const navigation = footer.getByRole('navigation', { name: '서비스 정책 및 안내', exact: true });
    await navigation.waitFor();
    const contact = page.locator(`a[href="${contactHref}"]`);
    assert.equal(await contact.count(), 1);
    assert.equal(await contact.getAttribute('href'), contactHref);
    assert.equal(await navigation.locator(`a[href="${contactHref}"]`).count(), 1);
    assert.equal(await contact.innerText(), '문의');

    for (const { label, path } of policyLinks) {
        const link = navigation.getByRole('link', { name: label, exact: true });
        assert.equal(await link.count(), 1);
        const destination = new URL((await link.getAttribute('href'))!, page.url());
        assert.equal(destination.origin, new URL(page.url()).origin);
        assert.equal(destination.pathname, path);
        assert.equal(destination.search, '');
        assert.equal(destination.hash, '');
    }

    await contact.scrollIntoViewIfNeeded();
    const bounds = await contact.boundingBox();
    assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
    const geometry = await navigation.evaluate((node) => {
        const anchors = [...node.querySelectorAll('a')];
        const boxes = anchors.map((anchor) => {
            const box = anchor.getBoundingClientRect();
            const text = document.createRange();
            text.selectNodeContents(anchor);
            const textFits = [...text.getClientRects()].every(
                (rect) => rect.left >= box.left - 1 && rect.right <= box.right + 1
            );
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, textFits };
        });
        return {
            textFits: boxes.every((box) => box.textFits),
            insideViewport: boxes.every((box) => box.left >= 0 && box.right <= innerWidth),
            overlap: boxes.some((box, index) =>
                boxes
                    .slice(index + 1)
                    .some(
                        (other) =>
                            Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1 &&
                            Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1
                    )
            ),
            flexWrap: getComputedStyle(node).flexWrap
        };
    });
    assert.equal(geometry.textFits, true);
    assert.equal(geometry.insideViewport, true);
    assert.equal(geometry.overlap, false);
    assert.equal(geometry.flexWrap, 'wrap');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    // 링크 활성화 없이 실제 Tab 진입과 보이는 포커스만 확인한다.
    const currentUrl = page.url();
    await contact.focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await contact.evaluate((node) => node === document.activeElement), false);
    await page.keyboard.press('Tab');
    const focus = await contact.evaluate((node) => ({
        active: node === document.activeElement,
        visible: node.matches(':focus-visible'),
        outlineStyle: getComputedStyle(node).outlineStyle,
        outlineWidth: Number.parseFloat(getComputedStyle(node).outlineWidth)
    }));
    assert.equal(focus.active, true);
    assert.equal(focus.visible, true);
    assert.notEqual(focus.outlineStyle, 'none');
    assert.ok(focus.outlineWidth >= 2);
    assert.equal(page.url(), currentUrl);
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `공유 푸터의 문의 링크는 공개·본인·관리·404 화면에서 한 번만 노출된다: ${width}px ${theme}`,
            { timeout: 60_000 },
            async (t) => {
                const f = await createBrowserFixture(t, { width });
                const { page } = f;
                await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await f.context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const visits: string[] = [];

                const visit = async (path: string, status: number) => {
                    const response = await page.goto(f.url + path);
                    assert.equal(response?.status(), status);
                    await page.getByRole('contentinfo').waitFor();
                    await page.waitForFunction(
                        (mode) => document.documentElement.dataset.mode === mode,
                        theme
                    );
                    await footerContact(page);
                    assert.deepEqual(f.errors, []);
                    assert.equal(f.context.pages().length, 1);
                    visits.push(path);
                };

                await visit('/', 200);
                await visit('/docs', 200);
                for (const policy of [
                    { path: '/terms', title: '이용약관', section: '제5조 이용 제한과 이의 제기' },
                    { path: '/privacy', title: '개인정보 처리방침', section: '열람·정정·삭제·처리정지 요청' }
                ]) {
                    await visit(policy.path, 200);
                    const article = page.getByRole('article');
                    await article
                        .getByRole('heading', { level: 1, name: policy.title, exact: true })
                        .waitFor();
                    await article
                        .getByRole('heading', { level: 2, name: policy.section, exact: true })
                        .waitFor();
                    assert.equal(await article.locator('time').getAttribute('datetime'), '2026-11-25');
                    assert.ok((await article.innerText()).includes(contactHref.slice('mailto:'.length)));
                }
                await visit('/footer-contact-missing-page', 404);

                const { cookie } = await f.session(HTTP_IDS.manager);
                const separator = cookie.indexOf('=');
                await f.context.addCookies([
                    {
                        name: cookie.slice(0, separator),
                        value: cookie.slice(separator + 1),
                        domain: '127.0.0.1',
                        path: '/',
                        secure: true,
                        httpOnly: true,
                        sameSite: 'Lax'
                    }
                ]);
                await visit('/me', 200);
                await visit(`/g/${HTTP_IDS.guild}/admin`, 200);
                assert.equal(visits.length, 7);

                if (width === 1440 && theme === 'primary') {
                    let documentRequests = 0;
                    page.on('request', (request) => {
                        if (request.isNavigationRequest() && request.frame() === page.mainFrame())
                            documentRequests += 1;
                    });
                    const adminPath = `/g/${HTTP_IDS.guild}/admin`;
                    const docs = page
                        .getByRole('contentinfo')
                        .getByRole('link', { name: '문서', exact: true });
                    await docs.click();
                    await page.waitForURL((url) => url.pathname === '/docs');
                    await page.getByRole('heading', { level: 1, name: '이용 안내', exact: true }).waitFor();
                    assert.equal(documentRequests, 0);
                    await footerContact(page);
                    await page.goBack();
                    await page.waitForURL((url) => url.pathname === adminPath);
                    await page.getByRole('heading', { level: 1, name: '서버 관리', exact: true }).waitFor();
                    await footerContact(page);
                    assert.equal(documentRequests, 0);
                    assert.deepEqual(f.errors, []);
                }
            }
        );
