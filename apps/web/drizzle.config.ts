import { defineConfig } from 'drizzle-kit';

// CLI 명령은 Node로 apps/web/.env를 읽는다. SQL 생성에는 DB 접속 정보가 필요하지 않다.
const databaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {})
});
