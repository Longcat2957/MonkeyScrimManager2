import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import type { BotApi } from '../api/client.js';
import { BotApiError, errorCode } from '../api/client.js';
import { handleAutocomplete, handleCommand } from '../commands/scrims.js';
import { notice } from '../messages/shared.js';
import { handleRegistration, RegistrationForms } from './registration.js';
import { SeasonPanels, openSeasonPanel, handleSeasonButton, submitSeasonName } from './seasons.js';
import {
    RecoveryForms,
    openRecoveryPanel,
    handleRecoveryComponent,
    submitRecoveryModal
} from './recovery.js';
import {
    openScrimCreation,
    reopenScrimCreation,
    ScrimCreationForms,
    submitScrimCreation
} from './create-scrim.js';

export function createInteractionHandler(api: BotApi, origin: URL) {
    const forms = new RegistrationForms();
    const creations = new ScrimCreationForms();
    const seasons = new SeasonPanels();
    const recoveries = new RecoveryForms();
    return async (interaction: Interaction) => {
        try {
            if (interaction.isAutocomplete()) await handleAutocomplete(interaction, api);
            else if (interaction.isChatInputCommand()) {
                if (interaction.commandName === '내전모집') await openScrimCreation(interaction, creations);
                else if (interaction.commandName === '시즌') await openSeasonPanel(interaction, api, seasons);
                else if (interaction.commandName === '게시복구')
                    await openRecoveryPanel(interaction, api, recoveries);
                else await handleCommand(interaction, api, origin);
            } else if (interaction.isButton() && interaction.customId === 'scrim-create:open')
                await openScrimCreation(interaction, creations);
            else if (interaction.isButton() && interaction.customId.startsWith('season:'))
                await handleSeasonButton(interaction, api, seasons);
            else if (
                (interaction.isButton() || interaction.isStringSelectMenu()) &&
                interaction.customId.startsWith('publication-recovery:')
            )
                await handleRecoveryComponent(interaction, api, recoveries);
            else if (interaction.isButton() && interaction.customId.startsWith('scrim-create:edit:'))
                await reopenScrimCreation(interaction, creations);
            else if (interaction.isModalSubmit() && interaction.customId.startsWith('season:'))
                await submitSeasonName(interaction, api, seasons);
            else if (interaction.isModalSubmit() && interaction.customId.startsWith('publication-recovery:'))
                await submitRecoveryModal(interaction, api, recoveries);
            else if (interaction.isModalSubmit() && interaction.customId.startsWith('scrim-create:'))
                await submitScrimCreation(interaction, api, origin, creations);
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
                        interaction.isModalSubmit() ||
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
