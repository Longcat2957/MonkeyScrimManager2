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
