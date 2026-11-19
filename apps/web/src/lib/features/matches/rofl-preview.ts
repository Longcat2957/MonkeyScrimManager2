import type { LolPosition } from '../guild/types.ts';

export type RoflPreview = {
    order: number;
    blueTeamSlot: 'a' | 'b';
    winner: 'blue' | 'red';
    players: {
        side: 'blue' | 'red';
        displayName: string;
        riotId: string;
        position: LolPosition | null;
        champion: string;
        kills: number | null;
        deaths: number | null;
        assists: number | null;
        newConnection: boolean;
    }[];
    digest: string;
};
