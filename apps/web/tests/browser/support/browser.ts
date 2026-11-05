import type { TestContext } from 'node:test';
import { chromium } from 'playwright';
import { createHttpFixture } from '../../api/support/http.ts';

/** 격리 앱만 브라우저에서 접근하고 실제 배포의 TLS 프록시·세션 쿠키 계약을 유지한다. */
export async function createBrowserFixture(t: TestContext, options: { width: number; userId?: string }) {
    const browser = await chromium.launch({ headless: true });
    // Node 정리 훅은 등록순으로 실행하므로 브라우저를 앱·DB보다 먼저 닫는다.
    t.after(() => browser.close());
    const fixture = await createHttpFixture(t);
    const context = await browser.newContext({
        viewport: { width: options.width, height: 1000 }
    });
    if (options.userId) {
        const { cookie } = await fixture.session(options.userId);
        const separator = cookie.indexOf('=');
        await context.addCookies([
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
    }
    const origin = new URL(fixture.url).origin;
    await context.route('**/*', async (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== origin) return route.abort();
        const headers: Record<string, string> = {
            ...request.headers(),
            'x-forwarded-proto': 'https'
        };
        if (request.method() === 'POST') headers.origin = fixture.origin;
        await route.fulfill({ response: await route.fetch({ headers, maxRedirects: 0 }) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        // 차단한 외부 장식 이미지·폰트의 전송 오류는 앱 JavaScript 오류와 구분한다.
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
            errors.push(message.text());
        }
    });
    return { ...fixture, browser, context, page, errors };
}
