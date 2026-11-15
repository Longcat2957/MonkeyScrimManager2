import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readRoflIdentity, type RoflIdentity } from './identity.ts';
import { prepareRoflImport, type RoflImportContext, type RoflImportData } from './import-model.ts';
import { RoflError } from './format.ts';
import { OperationLimitError } from '../operations/errors.ts';
import { projectRoflGame, type RoflGameProjection } from './projection.ts';

export type PreparedRofl = { identity: RoflIdentity[]; prepared: RoflImportData };
type Reply =
    | { ok: true; result: PreparedRofl | RoflGameProjection }
    | { ok: false; code: ConstructorParameters<typeof RoflError>[0]; message: string }
    | { ok: false; internal: true };

// 동적 import로 독립 서버 chunk를 만든다. 같은 파일이 worker의 진입점이며 DB·비밀 환경은 읽지 않는다.
if (!isMainThread && ['prepare-rofl', 'project-rofl'].includes(workerData?.task)) {
    try {
        const { bytes, context } = workerData as { bytes: Uint8Array; context: RoflImportContext };
        parentPort!.postMessage({
            ok: true,
            result:
                workerData.task === 'prepare-rofl'
                    ? { identity: readRoflIdentity(bytes), prepared: prepareRoflImport(bytes, context) }
                    : projectRoflGame(bytes)
        } satisfies Reply);
    } catch (cause) {
        parentPort!.postMessage(
            cause instanceof RoflError
                ? ({ ok: false, code: cause.code, message: cause.message } satisfies Reply)
                : ({ ok: false, internal: true } satisfies Reply)
        );
    }
}

async function runRoflWorker(
    bytes: Uint8Array,
    context: RoflImportContext | undefined,
    task: 'prepare-rofl' | 'project-rofl',
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<PreparedRofl | RoflGameProjection> {
    if (options.signal?.aborted)
        throw new OperationLimitError('ROFL_ABORTED', 408, '파일 처리를 중단했어요. 다시 시도해 주세요.');
    // 호출자의 바이트는 복구·중복 확인에 재사용할 수 있으므로 복사본만 worker로 이전한다.
    const copied = Uint8Array.from(bytes);
    const worker = new Worker(new URL(import.meta.url), {
        workerData: { task, bytes: copied, context },
        transferList: [copied.buffer],
        env: {},
        execArgv: import.meta.url.endsWith('.ts') ? ['--experimental-strip-types'] : [],
        resourceLimits: { maxOldGenerationSizeMb: 64 },
        stdout: true,
        stderr: true
    });
    worker.stdout.resume();
    worker.stderr.resume();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = async (reply?: Reply, failure?: OperationLimitError) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
            // 성공·실패 모두 실제 thread 종료를 기다린 뒤 처리 슬롯을 돌려준다.
            try {
                await worker.terminate();
            } catch {
                reject(
                    new OperationLimitError(
                        'ROFL_PROCESSING_FAILED',
                        503,
                        '파일 처리 종료를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
                        1
                    )
                );
                return;
            }
            if (failure) reject(failure);
            else if (reply?.ok) resolve(reply.result);
            else if (reply && 'code' in reply) reject(new RoflError(reply.code, reply.message));
            else
                reject(
                    new OperationLimitError(
                        'ROFL_PROCESSING_FAILED',
                        503,
                        '파일을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
                        1
                    )
                );
        };
        const abort = () => {
            void finish(
                undefined,
                new OperationLimitError('ROFL_ABORTED', 408, '파일 처리를 중단했어요. 다시 시도해 주세요.')
            );
        };
        const timer = setTimeout(() => {
            void finish(
                undefined,
                new OperationLimitError(
                    'ROFL_PROCESSING_TIMEOUT',
                    503,
                    '파일 처리 시간이 길어 중단했어요. 잠시 후 다시 시도해 주세요.',
                    1
                )
            );
        }, options.timeoutMs ?? 5000);
        options.signal?.addEventListener('abort', abort, { once: true });
        worker.once('message', (reply: Reply) => {
            void finish(reply);
        });
        worker.once('error', () => {
            void finish();
        });
        worker.once('exit', () => {
            void finish();
        });
    });
}

export async function prepareRoflInWorker(
    bytes: Uint8Array,
    context: RoflImportContext,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
) {
    return (await runRoflWorker(bytes, context, 'prepare-rofl', options)) as PreparedRofl;
}

export async function projectRoflInWorker(
    bytes: Uint8Array,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
) {
    return (await runRoflWorker(bytes, undefined, 'project-rofl', options)) as RoflGameProjection;
}
