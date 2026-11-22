import { requestRiot, type PlatformRouting } from '../client.ts';
import { arrayResponse, invalidResponse, objectResponse, pathSegment } from '../validation.ts';

const soloQuery = { queue: 420, count: 20 } as const;

export async function getSoloMatchIds(puuid: string, platform: PlatformRouting): Promise<string[]> {
    const ids = arrayResponse(
        await requestRiot<unknown>(`/lol/match/v5/matches/by-puuid/${pathSegment(puuid, 'puuid')}/ids`, {
            platform,
            query: soloQuery,
            background: true
        })
    );
    if (
        ids.length > soloQuery.count ||
        ids.some((id) => typeof id !== 'string' || !/^[A-Z0-9]{2,4}_\d{1,20}$/.test(id)) ||
        new Set(ids).size !== ids.length
    )
        invalidResponse();
    return ids as string[];
}

export async function getSoloMatchParticipants(matchId: string, puuid: string, platform: PlatformRouting) {
    pathSegment(puuid, 'puuid');
    const response = objectResponse(
        await requestRiot<unknown>(`/lol/match/v5/matches/${pathSegment(matchId, 'matchId')}`, {
            platform,
            background: true
        })
    );
    const metadata = objectResponse(response.metadata);
    const info = objectResponse(response.info);
    if (metadata.matchId !== matchId || info.queueId !== soloQuery.queue) invalidResponse();
    const ids = arrayResponse(metadata.participants);
    const missing = new Set(ids);
    const rows = arrayResponse(info.participants);
    if (missing.size !== ids.length || rows.length !== ids.length || !missing.has(puuid.trim())) {
        invalidResponse();
    }
    // 명단의 배열 순서가 아니라 실제 PUUID로 귀속하고, 원본 경기 응답은 보관하지 않는다.
    return rows.map((row) => {
        const { puuid, championId } = objectResponse(row);
        if (
            typeof puuid !== 'string' ||
            !puuid.trim() ||
            !missing.delete(puuid) ||
            typeof championId !== 'number' ||
            !Number.isSafeInteger(championId) ||
            championId <= 0
        )
            return invalidResponse();
        return { puuid, championId };
    });
}
