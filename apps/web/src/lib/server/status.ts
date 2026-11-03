import { BOT_STATUS_URL, DATABASE_URL } from '$app/env/private';
import { sql } from 'drizzle-orm';
import { botCheck, databaseCheck, type Probe, type ServiceStatus } from '#lib/features/backoffice/status.ts';
import { getDb } from './db/index.ts';

const TIMEOUT_MS = 3000;

class ProbeTimeout extends Error {}

// 실패 이유를 Probe로 바꾼다. 시간 초과가 나면 결과를 기다리지 않는다.
async function probe<T>(configured: boolean, run: (signal: AbortSignal) => Promise<T>): Promise<Probe<T>> {
	if (!configured) return { ok: false, reason: 'unconfigured' };
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new ProbeTimeout());
		}, TIMEOUT_MS);
	});
	const started = performance.now();
	try {
		const value = await Promise.race([run(controller.signal), timeout]);
		return { ok: true, value, latencyMs: Math.round(performance.now() - started) };
	} catch (cause) {
		return { ok: false, reason: cause instanceof ProbeTimeout ? 'timeout' : 'error' };
	} finally {
		clearTimeout(timer);
	}
}

export async function checkServices(): Promise<ServiceStatus> {
	const [database, bot] = await Promise.all([
		probe(Boolean(DATABASE_URL.trim()), async () => {
			await getDb().execute(sql`select 1`);
			return null;
		}),
		probe(Boolean(BOT_STATUS_URL.trim()), async (signal) => {
			const response = await fetch(BOT_STATUS_URL.trim(), { signal, redirect: 'error', headers: { Accept: 'application/json' } });
			if (!response.ok) throw new Error(`봇 상태 응답 ${response.status}`);
			return (await response.json()) as unknown;
		})
	]);
	return { checkedAt: new Date().toISOString(), services: [databaseCheck(database), botCheck(bot)] };
}
