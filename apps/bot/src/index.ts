import { Client, Events, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_TOKEN?.trim();

if (!token) {
  console.error('DISCORD_TOKEN 환경 변수가 필요합니다. apps/bot/.env를 설정하세요.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Discord 봇 연결 완료: ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error('Discord 클라이언트 오류:', error);
});

process.once('SIGINT', () => void client.destroy());
process.once('SIGTERM', () => void client.destroy());

try {
  await client.login(token);
} catch (error) {
  console.error('Discord 로그인에 실패했습니다:', error);
  await client.destroy();
  process.exitCode = 1;
}
