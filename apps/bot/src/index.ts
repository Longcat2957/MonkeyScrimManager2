import { Client, Events, GatewayIntentBits } from 'discord.js';
import { startStatusServer } from './status.js';

const token = process.env.DISCORD_TOKEN?.trim();

if (!token) {
  console.error('DISCORD_TOKEN 환경 변수가 필요합니다. apps/bot/.env를 설정하세요.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 설정하지 않으면 상태 확인 서버를 열지 않는다.
const statusPort = Number(process.env.BOT_STATUS_PORT?.trim() || 0);
const statusServer = statusPort ? startStatusServer(client, statusPort) : null;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Discord 봇 연결 완료: ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error('Discord 클라이언트 오류:', error);
});

function shutdown() {
  statusServer?.close();
  void client.destroy();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  await client.login(token);
} catch (error) {
  console.error('Discord 로그인에 실패했습니다:', error);
  statusServer?.close();
  await client.destroy();
  process.exitCode = 1;
}
