import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import type { BotApi } from '../api/client.js';
import { BotApiError, errorCode } from '../api/client.js';
import { handleAutocomplete, handleCommand } from '../commands/scrims.js';
import { notice } from '../messages/shared.js';
import { handleRegistration, RegistrationForms } from './registration.js';

export function createInteractionHandler(api: BotApi, origin: URL) {
    const forms = new RegistrationForms();
    return async (interaction: Interaction) => {
        try {
            if (interaction.isAutocomplete()) await handleAutocomplete(interaction, api);
            else if (interaction.isChatInputCommand()) await handleCommand(interaction, api, origin);
            else if (interaction.isButton() || interaction.isStringSelectMenu())
                await handleRegistration(interaction, api, forms);
        } catch (error) {
            console.error('Discord 요청 처리 실패:', errorCode(error));
            if (!interaction.isRepliable()) return;
            const text =
                error instanceof BotApiError
                    ? error.message
                    : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
            try {
                const reply = {
                    ...notice(text),
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                };
                if (interaction.deferred || interaction.replied) {
                    if (
                        interaction.isChatInputCommand() ||
                        (interaction.isButton() && interaction.customId.startsWith('registration:'))
                    ) {
                        await interaction.editReply(notice(text));
                    } else await interaction.followUp(reply);
                } else await interaction.reply(reply);
            } catch {
                console.error('Discord 오류 안내 전송 실패');
            }
        }
    };
}
