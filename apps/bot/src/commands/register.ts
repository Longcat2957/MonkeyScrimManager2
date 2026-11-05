import { REST, Routes } from 'discord.js';
import { readConfig } from '../config.js';
import { commands } from './definitions.js';

const config = readConfig();
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--global'))
    throw new Error('지원하는 등록 옵션은 --global뿐입니다. 기본 대상은 DISCORD_TEST_GUILD_ID입니다.');
const global = args.includes('--global');
if (!config.applicationId) throw new Error('명령 등록에는 DISCORD_APPLICATION_ID가 필요합니다.');
if (!global && !config.testGuildId)
    throw new Error('테스트 서버 등록에는 DISCORD_TEST_GUILD_ID가 필요합니다.');
const rest = new REST({ version: '10', retries: 0, timeout: 10_000 }).setToken(config.token);
try {
    const application = (await rest.get(Routes.oauth2CurrentApplication())) as { id: string };
    if (application.id !== config.applicationId)
        throw new Error('봇 토큰과 DISCORD_APPLICATION_ID가 다른 애플리케이션입니다.');
    const route = global
        ? Routes.applicationCommands(config.applicationId)
        : Routes.applicationGuildCommands(config.applicationId, config.testGuildId!);
    await rest.put(route, { body: commands.map((command) => command.toJSON()) });
    console.log(global ? '운영 전역 명령 등록 완료' : '테스트 서버 명령 등록 완료');
} catch {
    console.error('명령 등록에 실패했습니다. 애플리케이션 ID·봇 초대·등록 대상을 확인해 주세요.');
    process.exitCode = 1;
}
