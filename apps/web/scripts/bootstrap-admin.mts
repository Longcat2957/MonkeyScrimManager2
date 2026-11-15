import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { databaseLimits } from '../src/lib/server/db/config.ts';
import { boundedDatabasePool } from '../src/lib/server/db/pool.ts';
import * as schema from '../src/lib/server/db/schema.ts';
import { isDiscordId } from '../src/lib/server/discord/client.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { bootstrapServiceAdmin } from '../src/lib/server/service-admin/service.ts';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const usage = '사용법: pnpm admin:bootstrap <기존 Discord 사용자 ID>';

if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage);
} else if (args.length !== 1 || !isDiscordId(args[0])) {
    console.error(usage);
    process.exitCode = 1;
} else {
    let pool: Pool | undefined;
    try {
        const databaseUrl = process.env.DATABASE_URL?.trim();
        if (!databaseUrl)
            throw new DomainError('SERVICE_UNAVAILABLE', '데이터베이스 연결 설정을 확인해 주세요');
        pool = boundedDatabasePool(databaseUrl, databaseLimits(process.env), 1);
        const db = drizzle({ client: pool, schema });
        await bootstrapServiceAdmin(db, args[0]);
        console.log('서비스 운영자를 초기 지정했습니다.');
    } catch (cause) {
        // 연결 URL·SQL·원시 오류를 터미널 기록에 남기지 않는다.
        console.error(
            cause instanceof DomainError ? cause.message : '서비스 운영자 초기 지정에 실패했습니다.'
        );
        process.exitCode = 1;
    } finally {
        try {
            await pool?.end();
        } catch {
            console.error('데이터베이스 연결 정리를 확인해 주세요.');
            process.exitCode = 1;
        }
    }
}
