import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createApiClient, errorCode } from './api/client.js';
import { readConfig } from './config.js';
import { createDiscordDelivery } from './delivery/discord.js';
import { PublicationWorker } from './delivery/worker.js';
import { attachGuildSynchronization, GuildSynchronizer } from './gateway/sync.js';
import { createInteractionHandler } from './interactions/router.js';
import { startStatusServer } from './status.js';

const config = readConfig();
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    // 큐에서 오래 기다리다가 작업 점유가 만료되지 않도록 429는 저장된 재시도로 돌린다.
    rest: { retries: 0, timeout: 10_000, rejectOnRateLimit: () => true }
});
const api = createApiClient({ origin: config.apiUrl, token: config.internalToken });
const synchronizer = new GuildSynchronizer(api);
const worker = new PublicationWorker(api, createDiscordDelivery(client.rest, config.webOrigin), () =>
    client.isReady()
);
const status = config.statusPort
    ? startStatusServer(client, config.statusPort, () => ({ api: api.health, delivery: worker.health }))
    : null;
const handleInteraction = createInteractionHandler(api, config.webOrigin);
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

attachGuildSynchronization(client, synchronizer);
client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction);
});
client.on(Events.Error, (error) => console.error('Discord 연결 오류:', errorCode(error)));
client.once(Events.ClientReady, (ready) => {
    if (config.applicationId && ready.application.id !== config.applicationId) {
        console.error('봇 토큰과 DISCORD_APPLICATION_ID가 다른 애플리케이션입니다.');
        process.exitCode = 1;
        void shutdown();
        return;
    }
    console.log('Monkeybot Discord 연결 완료');
    const reconcile = () => {
        void synchronizer.reconcile(
            [...ready.guilds.cache.values()].filter((guild) => guild.available).map((guild) => guild.id)
        );
    };
    reconcile();
    reconcileTimer = setInterval(reconcile, 5 * 60_000);
    worker.start();
});
client.on(Events.ShardResume, () => {
    void synchronizer.reconcile(
        [...client.guilds.cache.values()].filter((guild) => guild.available).map((guild) => guild.id)
    );
});

let stopping: Promise<void> | null = null;
function shutdown() {
    return (stopping ??= (async () => {
        if (reconcileTimer) clearInterval(reconcileTimer);
        // 진행 중인 게시의 성공 보고를 마친 뒤 Gateway 연결을 닫는다.
        await Promise.allSettled([worker.stop(), synchronizer.stop()]);
        if (status) await new Promise<void>((resolve) => status.close(() => resolve()));
        await client.destroy();
    })());
}
process.once('SIGINT', () => {
    void shutdown();
});
process.once('SIGTERM', () => {
    void shutdown();
});

try {
    await client.login(config.token);
} catch (error) {
    console.error('Discord 로그인 실패:', errorCode(error));
    process.exitCode = 1;
    await shutdown();
}
