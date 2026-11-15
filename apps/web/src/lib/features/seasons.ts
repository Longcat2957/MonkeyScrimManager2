export type RecordSeason = {
    id: string;
    name: string;
    startedAt: string;
    endedAt: string | null;
};

export type RecordSeasonSelection = {
    seasons: RecordSeason[];
    selectedSeasonId: string | null;
};

export type GuildSeasonOverview = {
    current: RecordSeason | null;
    completed: RecordSeason[];
};

export type RotateGuildSeasonInput = {
    expectedCurrentSeasonId: string;
    name: string;
    confirm: boolean;
};
