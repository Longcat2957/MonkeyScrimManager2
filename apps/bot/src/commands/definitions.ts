import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

function command(name: string, description: string) {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setContexts(InteractionContextType.Guild);
}

// Discord 기본 권한만으로 운영자 역할 사용자를 숨기지 않는다. 모든 쓰기는 웹에서 실효 권한을 다시 검사한다.
export const commands = [
    command('초기설정', 'Monkeybot의 첫 시즌을 준비하고 서버 설정을 엽니다.'),
    command('시즌', '현재·지난 시즌을 확인하거나 새 시즌을 시작합니다.')
        .addStringOption((option) =>
            option.setName('이름').setDescription('새 시즌 이름').setMinLength(1).setMaxLength(100)
        )
        .addStringOption((option) =>
            option
                .setName('현재시즌')
                .setDescription('종료할 현재 시즌을 자동완성에서 선택해 주세요.')
                .setAutocomplete(true)
        )
        .addBooleanOption((option) =>
            option.setName('전환확인').setDescription('선택한 현재 시즌을 종료하고 새 시즌을 시작합니다.')
        ),
    command('내전모집', '입력창에서 새 내전을 만들고 모집을 시작합니다.'),
    command('내전목록', '이 서버의 내전 목록을 엽니다.'),
    command('게시복구', '실패하거나 전달 여부가 불명인 게시 작업을 복구합니다.')
        .addStringOption((option) =>
            option
                .setName('작업')
                .setDescription('복구할 내전 게시 작업')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option.setName('메시지').setDescription('이미 게시된 글이 있다면 해당 메시지 ID')
        )
        .addBooleanOption((option) =>
            option
                .setName('글없음확인')
                .setDescription('대상 글이 없음을 확인한 경우에만 선택. DM은 수신자에게 확인')
        )
];
