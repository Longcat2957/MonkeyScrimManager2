import type { LolPosition } from '../guild/types.ts';
import type { ChampionRef } from '../scrims/formation.ts';

export const MAX_PREFERRED_CHAMPIONS = 10;
export const CHAMPION_PREFERENCE_POSITIONS: readonly LolPosition[] = [
    'top',
    'jungle',
    'mid',
    'bot',
    'support'
];

export type ChampionPreferenceSelections = Record<LolPosition, number[]>;
export type ChampionPreferenceOption = ChampionRef & { championId: number };
export type MyChampionPreferences = {
    preferences: ChampionPreferenceSelections;
    catalog: ChampionPreferenceOption[];
    catalogError: string | null;
};
export type ChampionPreferenceInput = { position: LolPosition; championIds: number[] };

export function emptyChampionPreferenceSelections(): ChampionPreferenceSelections {
    return { top: [], jungle: [], mid: [], bot: [], support: [] };
}
