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
    command('내전모집', '새 내전을 만들고 설정한 모집 채널에 게시합니다.')
        .addStringOption((option) =>
            option.setName('제목').setDescription('내전 제목').setRequired(true).setMaxLength(50)
        )
        .addStringOption((option) =>
            option.setName('예정시각').setDescription('한국 시각 YYYY-MM-DD HH:mm, 비우면 일정 미정')
        )
        .addIntegerOption((option) =>
            option
                .setName('팀수')
                .setDescription('팀당 5명, 기본 2팀')
                .addChoices({ name: '2팀', value: 2 }, { name: '3팀', value: 3 }, { name: '4팀', value: 4 })
        )
        .addIntegerOption((option) =>
            option
                .setName('대기정원')
                .setDescription('추가 신청 인원, 기본 0명')
                .setMinValue(0)
                .setMaxValue(10)
        )
        .addBooleanOption((option) =>
            option
                .setName('하드피어리스')
                .setDescription('실제 사용 챔피언을 기준으로 피어리스를 안내합니다.')
        ),
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
