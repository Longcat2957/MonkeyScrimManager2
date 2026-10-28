import { readFile, stat } from 'node:fs/promises';
import { MAX_ROFL_FILE_BYTES, RoflError } from '../apps/web/src/lib/server/rofl/format.ts';
import { projectRoflGame } from '../apps/web/src/lib/server/rofl/projection.ts';

const [path, ...extra] = process.argv.slice(2);
if (!path || extra.length > 0) {
	console.error('사용법: pnpm rofl:project /path/to/replay.rofl');
	process.exitCode = 1;
} else {
	try {
		const file = await stat(path);
		if (!file.isFile()) throw new RoflError('INVALID_FILE', '일반 파일 경로를 지정해 주세요.');
		if (file.size > MAX_ROFL_FILE_BYTES) throw new RoflError('FILE_TOO_LARGE', 'ROFL 파일은 128 MiB 이하여야 합니다.');
		process.stdout.write(JSON.stringify(projectRoflGame(await readFile(path)), null, 2) + '\n');
	} catch (error) {
		if (error instanceof RoflError) console.error(`${error.code}: ${error.message}`);
		else console.error('ROFL 파일을 읽지 못했습니다. 경로와 읽기 권한을 확인해 주세요.');
		process.exitCode = 1;
	}
}
