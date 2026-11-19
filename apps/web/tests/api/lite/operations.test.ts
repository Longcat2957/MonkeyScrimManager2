import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { databaseLimits } from '../../../src/lib/server/db/config.ts';
import {
    noteDatabaseQuery,
    noteDatabaseWait,
    notePhase,
    noteUpstreamRequest,
    observeRequest
} from '../../../src/lib/server/operations/context.ts';
import { noteRequestError, OperationLimitError } from '../../../src/lib/server/operations/errors.ts';
import { observedSection } from '../../../src/lib/server/operations/section.ts';
import { DomainError } from '../../../src/lib/server/errors.ts';
import { RoflAdmission, readRoflForm, roflLimits } from '../../../src/lib/server/rofl/processing.ts';
import { prepareRoflInWorker, projectRoflInWorker } from '../../../src/lib/server/rofl/processing-worker.ts';
import { replayBytes, replayPlayer } from '../support/rofl-fixtures.ts';

const context = {
    guildId: '970000000000000001',
    scrimId: '10000000-0000-4000-8000-000000000001',
    matchId: '20000000-0000-4000-8000-000000000001',
    gameId: '30000000-0000-4000-8000-000000000001',
    gameNumber: 1,
    uploadedByUserId: '970000000000000011',
    uploadedAt: new Date('2026-11-15T00:00:00Z')
};
const bytes = () =>
    replayBytes(
        Array.from({ length: 10 }, (_, index) => replayPlayer('WorkerFixture' + index, 'KR1', index))
    );
const limitError = (code: string) => (error: unknown) =>
    error instanceof OperationLimitError && error.code === code;
const workerPorts = () => process.getActiveResourcesInfo().filter((kind) => kind === 'MessagePort').length;

test('운영 제한은 양수·유효 순서를 요구하고 낮춘 전역 ROFL 동시성의 기본 사용자 한도를 맞춘다', () => {
    assert.throws(() => databaseLimits({ DB_STATEMENT_TIMEOUT_MS: '0' }));
    assert.throws(() => databaseLimits({ DB_LOCK_TIMEOUT_MS: '20000' }));
    assert.throws(() => roflLimits({ ROFL_PARSE_TIMEOUT_MS: 'unlimited' }));
    assert.throws(() => roflLimits({ ROFL_MAX_CONCURRENT: '1', ROFL_USER_CONCURRENT: '2' }));
    assert.equal(roflLimits({ ROFL_MAX_CONCURRENT: '1' }).perUserConcurrent, 1);
});

test('ROFL 입장은 큐 없이 전역·사용자 동시성을 제한하고 해제는 중복 호출해도 안전하다', () => {
    const admission = new RoflAdmission({ ...roflLimits({}), concurrent: 2, perUserConcurrent: 1 });
    const first = admission.claim('a');
    assert.throws(() => admission.claim('a'), limitError('ROFL_OVERLOADED'));
    const second = admission.claim('b');
    assert.throws(() => admission.claim('c'), limitError('ROFL_OVERLOADED'));
    first();
    first();
    const third = admission.claim('c');
    second();
    third();
    admission.claim('a')();
});

test('사용자 처리 횟수는 해제 후에도 기간 동안 유지하고 Retry-After가 지난 뒤 회복한다', () => {
    let now = 0;
    const admission = new RoflAdmission({ ...roflLimits({}), perUserRequests: 1, windowMs: 1500 }, () => now);
    admission.claim('a')();
    assert.throws(
        () => admission.claim('a'),
        (error) =>
            error instanceof OperationLimitError &&
            error.code === 'ROFL_RATE_LIMITED' &&
            error.retryAfterSeconds === 2
    );
    admission.claim('b')();
    now = 1500;
    admission.claim('a')();
});

test('ROFL 본문 시간 초과는 실제 reader를 취소하고 완료되지 않은 읽기를 남기지 않는다', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        cancel() {
            cancelled = true;
        }
    });
    const request = new Request('http://fixture.invalid', {
        method: 'POST',
        body,
        duplex: 'half'
    } as RequestInit);
    await assert.rejects(readRoflForm(request, 20), limitError('ROFL_BODY_TIMEOUT'));
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
});

test('정상 multipart는 파일·진영·확인값을 보존하고 크기/중단 제한은 parsing 전에 거절한다', async () => {
    const form = new FormData();
    form.set('blueTeamSlot', 'a');
    form.set('blueTeamConfirmed', 'true');
    form.set('file', new File([Uint8Array.from(bytes())], 'fixture.rofl'));
    const parsed = await readRoflForm(
        new Request('http://fixture.invalid', { method: 'POST', body: form }),
        1000
    );
    assert.equal(parsed.get('blueTeamSlot'), 'a');
    assert.equal(parsed.get('blueTeamConfirmed'), 'true');
    assert.equal((parsed.get('file') as File).name, 'fixture.rofl');
    await assert.rejects(
        readRoflForm(
            new Request('http://fixture.invalid', {
                method: 'POST',
                body: '',
                headers: { 'content-length': String(80 * 1024 * 1024) }
            }),
            1000
        ),
        limitError('ROFL_BODY_TOO_LARGE')
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        readRoflForm(
            new Request('http://fixture.invalid', { method: 'POST', body: '', signal: controller.signal }),
            1000
        ),
        limitError('ROFL_ABORTED')
    );
});

test('실제 worker는 원본 바이트·Date와 실출전 10명을 보존하고 timeout 후 같은 입력으로 회복한다', async () => {
    const original = bytes();
    const before = workerPorts();
    await assert.rejects(
        prepareRoflInWorker(original, context, { timeoutMs: 1 }),
        limitError('ROFL_PROCESSING_TIMEOUT')
    );
    assert.equal(workerPorts(), before);
    const result = await prepareRoflInWorker(original, context);
    assert.equal(result.identity.length, 10);
    assert.equal(result.prepared.rows.participants.length, 10);
    assert.equal(result.prepared.rows.metadata.fileSizeBytes, original.byteLength);
    assert.deepEqual(result.prepared.rows.metadata.uploadedAt, context.uploadedAt);
    assert.ok(original.byteLength > 0);
    const projection = await projectRoflInWorker(original);
    assert.equal(projection.participants.length, 10);
    assert.equal(projection.result.status, 'consistent');
    assert.equal(workerPorts(), before);
});

test('실제 worker 중단과 terminate 실패도 Promise를 완료하고 thread를 남기지 않는다', async (t) => {
    const before = workerPorts();
    const controller = new AbortController();
    const pending = prepareRoflInWorker(bytes(), context, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, limitError('ROFL_ABORTED'));
    assert.equal(workerPorts(), before);
    const terminate = Worker.prototype.terminate;
    t.mock.method(Worker.prototype, 'terminate', async function (this: Worker) {
        await terminate.call(this);
        throw new Error('종료 확인 실패 fixture');
    });
    await assert.rejects(prepareRoflInWorker(bytes(), context), limitError('ROFL_PROCESSING_FAILED'));
    assert.equal(workerPorts(), before);
});

test('동시 요청·부분 실패의 관측은 route 템플릿·상태·코드만 기록하고 원시 원인을 남기지 않는다', async () => {
    const lines: string[] = [];
    const privateText = 'fixture-private-cookie-riot-id-sql-query';
    await Promise.all([
        observeRequest(
            { requestId: 'first', routeId: '/g/[guildId]', method: 'GET' },
            async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                observedSection({ status: 'rejected', reason: new Error(privateText) }, privateText);
                return new Response('', { status: 200 });
            },
            (line) => lines.push(line)
        ),
        observeRequest(
            { requestId: 'second', routeId: '/g/[guildId]/scrims', method: 'POST' },
            async () => {
                noteRequestError(new DomainError('CONFLICT', privateText));
                return new Response('', { status: 409 });
            },
            (line) => lines.push(line)
        )
    ]);
    assert.ok(!lines.join('').includes(privateText));
    const values = lines.map((line) => JSON.parse(line));
    assert.equal(values.find((value) => value.requestId === 'first').code, 'INTERNAL_ERROR');
    assert.equal(values.find((value) => value.requestId === 'second').code, 'CONFLICT');
    assert.deepEqual(
        Object.keys(values[0]).sort(),
        [
            'event',
            'requestId',
            'route',
            'kind',
            'method',
            'status',
            'code',
            'durationMs',
            'phases',
            'db',
            'upstream'
        ].sort()
    );
    assert.ok(values.every((value) => Number.isFinite(value.durationMs)));
    assert.equal(values.find((value) => value.requestId === 'first').kind, 'page');
    assert.equal(values.find((value) => value.requestId === 'second').kind, 'action');
    await observeRequest(
        { requestId: 'logger-failure', routeId: null, method: 'GET' },
        async () => new Response(''),
        () => {
            throw new Error('로그 출력 실패');
        }
    );
});

test('요청 관측은 구간·DB·외부 호출 시간을 같은 요청에만 기록한다', async () => {
    const lines: string[] = [];
    await observeRequest(
        { requestId: 'timed', routeId: '/api/fixture', method: 'GET' },
        async () => {
            notePhase('sessionMs', 3.25);
            noteDatabaseWait(2.5);
            noteDatabaseQuery(11, true, 'select 1');
            noteUpstreamRequest('riot', 7, true);
            return new Response('');
        },
        (line) => lines.push(line)
    );
    const [value] = lines.map((line) => JSON.parse(line));
    assert.equal(value.kind, 'api');
    assert.deepEqual(value.phases, { sessionMs: 3.25, accessMs: 0 });
    assert.deepEqual(value.db, { count: 1, totalMs: 11, maxMs: 11, waitMs: 2.5, slow: 0 });
    assert.deepEqual(value.upstream.riot, { count: 1, totalMs: 7, maxMs: 7 });
});

test('데이터 요청과 내부 경로는 각각 data·internal로 구분한다', async () => {
    const lines: string[] = [];
    await Promise.all([
        observeRequest(
            { requestId: 'data', routeId: '/g/[guildId]', method: 'GET', isDataRequest: true },
            async () => new Response(''),
            (line) => lines.push(line)
        ),
        observeRequest(
            { requestId: 'internal', routeId: '/internal/bot/fixture', method: 'POST' },
            async () => new Response(''),
            (line) => lines.push(line)
        )
    ]);
    const values = lines.map((line) => JSON.parse(line));
    assert.equal(values.find((value) => value.requestId === 'data').kind, 'data');
    assert.equal(values.find((value) => value.requestId === 'internal').kind, 'internal');
});
