import { readFile, stat } from 'node:fs/promises';
import { MAX_ROFL_FILE_BYTES, parseRoflMetadata, RoflError } from '../apps/web/src/lib/server/rofl/parser.ts';

const [path, ...extra] = process.argv.slice(2);
if (!path || extra.length > 0) {
	console.error('사용법: pnpm rofl:inspect /path/to/replay.rofl');
	process.exitCode = 1;
} else {
	try {
		const file = await stat(path);
		if (!file.isFile()) throw new RoflError('INVALID_FILE', '일반 파일 경로를 지정해 주세요.');
		if (file.size > MAX_ROFL_FILE_BYTES) throw new RoflError('FILE_TOO_LARGE', 'ROFL 파일은 128 MiB 이하여야 합니다.');
		const result = parseRoflMetadata(await readFile(path));
		process.stdout.write(JSON.stringify(result, null, 2) + '\n');
	} catch (error) {
		if (error instanceof RoflError) console.error(`${error.code}: ${error.message}`);
		else console.error('ROFL 파일을 읽지 못했습니다. 경로와 읽기 권한을 확인해 주세요.');
		process.exitCode = 1;
	}
}
