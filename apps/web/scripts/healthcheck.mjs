import pg from 'pg';

const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000
});
try {
    await client.connect();
    await client.query('SELECT id FROM public.users LIMIT 0');
    const response = await fetch('http://127.0.0.1:3000/docs', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error();
} catch {
    process.exitCode = 1;
} finally {
    await client.end().catch(() => {
        process.exitCode = 1;
    });
}
