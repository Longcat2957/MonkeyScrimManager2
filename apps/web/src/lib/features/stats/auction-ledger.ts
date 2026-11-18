export interface LedgerPerson {
    id: string | null;
    name: string;
    avatarUrl: string | null;
}

export interface LedgerSigning {
    id: string;
    player: LedgerPerson;
    buyer: LedgerPerson | null;
    price: number | null;
    order: number;
    acquiredAt: string | null;
}

export interface LedgerTeam {
    id: string;
    name: string;
    captain: LedgerPerson | null;
    budget: number;
    signings: LedgerSigning[];
}

export interface LedgerAuction {
    id: string;
    title: string;
    teams: LedgerTeam[];
}

export function priceSummary(values: (number | null)[]) {
    const sorted = values.filter((p): p is number => p !== null && p > 0).sort((a, b) => a - b);
    const count = sorted.length;
    if (!count) return null;
    const mid = Math.floor(count / 2);
    return {
        count,
        average: sorted.reduce((sum, p) => sum + p, 0) / count,
        median: count % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
        min: sorted[0]!,
        max: sorted[count - 1]!
    };
}
