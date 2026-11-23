import { sql } from 'drizzle-orm';
import type { SeasonTitleHolder } from '../../features/players/achievements.ts';
import { publicDisplayName, readPublicIdentities } from '../accounts/public-identity.ts';
import type { Transaction } from '../db/types.ts';
import { completedBo3, titleGames } from '../matches/title-scope.ts';

type RankedPlayer = Omit<SeasonTitleHolder, 'displayName' | 'iconUrl'>;

/** The profiler and the service use the same bound query. Only the final projection loses numeric precision. */
export function seasonTitleQuery(guildId: string, seasonId: string, userId?: string, rankLimit = 10) {
    return sql`with ${titleGames(guildId, { seasonId })}, ${completedBo3},
    players as (
        select g.game_id, g.match_id, g.game_number, g.game_length_ms as ms,
               p.side, p.position, s.user_id, p.side = g.winner_side as won,
               (p.side = 'blue') = (g.blue_team_slot = 'a') as on_a,
               nullif(d.champion, '') as champion,
               (d.stats->>'kills')::numeric as kills, (d.stats->>'assists')::numeric as assists,
               (d.stats->>'deaths')::numeric as deaths, (d.stats->>'wardsKilled')::numeric as wards,
               (d.stats->>'damageDealtToChampions')::numeric as damage, (d.stats->>'goldEarned')::numeric as gold,
               (d.stats->>'damageTaken')::numeric as taken,
               (d.stats->>'minionsKilled')::numeric + (d.stats->>'neutralMinionsKilled')::numeric as cs,
               (d.stats->>'healOnTeammates')::numeric + (d.stats->>'damageShieldedOnTeammates')::numeric as protection
        from valid_games g
        join game_participants p on p.game_id = g.game_id and p.rofl_metadata_id = g.rofl_metadata_id
        join scrim_participants s on s.id = p.scrim_participant_id
        left join rofl_participant_data_v1 d on d.rofl_metadata_id = p.rofl_metadata_id
                                              and d.participant_index = p.rofl_participant_index
    ), team_totals as (
        select players.*,
               case when count(*) over team = 5 and count(kills) over team = 5 then sum(kills) over team end as team_kills,
               case when count(*) over team = 5 and count(damage) over team = 5 then sum(damage) over team end as team_damage,
               case when count(*) over team = 5 and count(gold) over team = 5 then sum(gold) over team end as team_gold
        from players window team as (partition by game_id, side)
    ), rates as (
        select user_id, v.title_id, v.comparison_position as position,
               sum(v.numerator) / sum(v.denominator) as score, count(*) as sample
        from team_totals cross join lateral (values
            ('season-kills', null::lol_position, kills, 1::numeric),
            ('season-assists', null, assists, 1),
            ('season-damage', null, damage * 60000, ms),
            ('season-participation', null, (kills + assists) * 100, team_kills),
            ('season-wards', null, wards * 60000, ms),
            ('season-efficiency', position, case when position is not null and team_damage > 0 and team_gold > 0 then
                (damage * team_gold - gold * team_damage) * 100 / (team_damage * team_gold) end, 1),
            ('season-cs', null, case when position <> 'jungle' then cs * 60000 end, ms),
            ('season-tanking', null, case when won then taken * 60000 end, ms),
            ('season-protection', null, protection * 60000, ms)
        ) v(title_id, comparison_position, numerator, denominator)
        where user_id is not null and v.numerator is not null and v.denominator > 0
        group by user_id, v.title_id, v.comparison_position having count(*) >= 10
    ), winning_sets as (
        select user_id, count(*) filter (where deaths = 0) as clean, count(deaths) as known_deaths,
               count(distinct position) as positions, count(position) as known_position
        from players where won and user_id is not null group by user_id
    ), champion_wins as (
        select user_id, champion, count(*) as wins from players
        where won and champion is not null and user_id is not null group by user_id, champion
    ), champion_totals as (
        select user_id, count(*) as champions, max(wins) as most_wins, sum(wins) as sample
        from champion_wins group by user_id
    ), series_players as (
        select p.match_id, user_id, bool_or(on_a = b.winner_a) as won_series,
               bool_or(game_number = 3) as played_decider, bool_or(game_number = 3 and won) as won_decider
        from players p join completed_bo3 b on b.match_id = p.match_id
        where user_id is not null group by p.match_id, user_id
    ), series_totals as (
        select user_id, count(*) as played, count(*) filter (where won_series) as wins,
               count(*) filter (where played_decider) as deciders, count(*) filter (where won_decider) as decider_wins
        from series_players group by user_id
    ), candidates as (
        select * from rates
        union all select user_id, 'season-clean-sheet', null, clean, known_deaths from winning_sets where clean > 0
        union all select user_id, 'season-positions', null, positions, known_position from winning_sets where positions > 0
        union all select user_id, 'season-champion-pool', null, champions, sample from champion_totals
        union all select user_id, 'season-one-trick', null, most_wins, sample from champion_totals
        union all select user_id, 'season-decider', null, decider_wins, deciders from series_totals where decider_wins > 0
        union all select user_id, 'season-series-rate', null, wins * 100::numeric / played, played from series_totals where played >= 5
    ), ranked as (
        select *, rank() over ranking as place,
               count(*) over (ranking range between current row and current row) > 1 as shared
        from candidates window ranking as (partition by title_id, position order by score desc)
    )
    select user_id as "userId", title_id as "titleId", position, score::double precision as score,
           sample::integer as sample, place::integer as rank, place = 1 and shared as tied
    from ranked where place <= ${userId === undefined ? rankLimit : 1}
    ${userId === undefined ? sql`` : sql`and user_id = ${userId}`} order by title_id, position, place, user_id`;
}

/** Call within readGuild after season selection; userId, if provided, is the resolved internal record user. */
export async function readSeasonTitles(
    tx: Transaction,
    guildId: string,
    seasonId: string | null,
    userId?: string,
    rankLimit = 10
): Promise<SeasonTitleHolder[]> {
    if (!seasonId) return [];
    const { rows } = await tx.execute<RankedPlayer>(seasonTitleQuery(guildId, seasonId, userId, rankLimit));
    const identities = await readPublicIdentities(
        tx,
        rows.map((row) => row.userId),
        guildId
    );
    return rows.map((row) => {
        const identity = identities.get(row.userId)!;
        return {
            ...row,
            userId: identity.userId,
            displayName: publicDisplayName(identity),
            iconUrl: identity.avatarUrl
        };
    });
}
