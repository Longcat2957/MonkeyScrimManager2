import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

function command(name: string, description: string) {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setContexts(InteractionContextType.Guild);
}

// 명령은 화면을 여는 진입점이다. 모든 쓰기는 웹에서 현재 실효 권한을 다시 검사한다.
export const commands = [
    command('초기설정', 'Monkeybot의 첫 시즌을 준비하고 서버 설정을 엽니다.'),
    command('시즌', '현재·지난 시즌을 확인하고 버튼으로 새 시즌을 시작합니다.'),
    command('내전모집', '입력창에서 새 내전을 만들고 모집을 시작합니다.'),
    command('내전목록', '이 서버의 내전 목록을 엽니다.'),
    command('게시복구', '실패한 게시 작업을 선택하고 버튼으로 복구합니다.')
];
