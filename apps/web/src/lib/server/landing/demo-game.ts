import sample from '#lib/content/landing-rofl.json' with { type: 'json' };
import type { DemoGameTemplate } from '#lib/features/landing/game.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { loadoutResolver } from '#lib/server/ddragon/loadout.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';

type RawParticipant = (typeof sample.participants)[number];

/**
 * 소개 화면 체험의 샘플 세트 기록 틀을 만든다. 실제 경기 화면과 같은 Data Dragon 이름·아이콘을 쓰고,
 * 조회에 실패하면 아이콘 없이 기록만 돌려준다. 평점처럼 실제 기준이 없는 값은 만들지 않는다.
 */
export async function demoGameTemplate(): Promise<DemoGameTemplate> {
    const version = await latestDataDragonVersion();
    const [champion, loadout] = await Promise.all([championResolver(version), loadoutResolver(version)]);
    const record = (raw: RawParticipant) => {
        const stats = raw.stats;
        return {
            champion: champion(raw.champion),
            level: stats.level,
            kills: stats.kills,
            deaths: stats.deaths,
            assists: stats.assists,
            cs: stats.minionsKilled + stats.neutralMinionsKilled,
            damage: stats.damageDealtToChampions,
            damageTaken: stats.damageTaken,
            gold: stats.goldEarned,
            visionScore: stats.visionScore,
            wardsPlaced: stats.wardsPlaced,
            wardsKilled: stats.wardsKilled,
            controlWards: stats.controlWardsBought,
            heal: stats.totalHeal,
            shield: stats.damageShieldedOnTeammates,
            largestKillingSpree: stats.largestKillingSpree,
            multiKills: {
                double: stats.doubleKills,
                triple: stats.tripleKills,
                quadra: stats.quadraKills,
                penta: stats.pentaKills
            },
            items: raw.loadout.itemIds.map(loadout.item),
            spells: raw.loadout.summonerSpellIds.map(loadout.spell),
            keystone: loadout.rune(raw.loadout.keystoneId),
            secondaryStyle: loadout.rune(raw.loadout.secondaryRuneStyleId),
            score: null,
            badge: null,
            titles: [],
            fearlessViolation: false
        };
    };
    const side = (teamId: number) => sample.participants.filter((raw) => raw.teamId === teamId).map(record);
    return {
        durationSec: Math.round(sample.gameLengthMs / 1000),
        patch: sample.gameVersion.split('.').slice(0, 2).join('.'),
        blueWin: sample.participants.some((raw) => raw.teamId === 100 && raw.win),
        sides: { blue: side(100), red: side(200) }
    };
}
