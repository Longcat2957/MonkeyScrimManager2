import { sql } from 'drizzle-orm';

/** Keep invalid completed sets in scoped_games: one unverified set disqualifies its series, not its siblings. */
export function titleGames(
    guildId: string,
    scope: { seasonId: string } | { matchId: string; gameId?: string }
) {
    return sql`scoped_games as (
        select g.id as game_id, m.id as match_id, g.rofl_metadata_id, g.game_number,
               g.blue_team_slot, g.winner_side, (g.winner_side = 'blue') = (g.blue_team_slot = 'a') as won_a,
               r.game_length_ms, r.rofl_metadata_id is not null as valid,
               m.best_of, m.status as match_status, m.winner_team_id, m.team_a_id, m.team_b_id
        from scrims s
        join matches m on m.scrim_id = s.id
        join games g on g.match_id = m.id
        left join rofl_game_data_v1 r on r.rofl_metadata_id = g.rofl_metadata_id and r.result_status = 'consistent'
        where s.guild_id = ${guildId} and s.status <> 'cancelled' and m.status <> 'cancelled'
          and g.status = 'completed' and ${
              'seasonId' in scope
                  ? sql`s.mmr_season_id = ${scope.seasonId}`
                  : sql`m.id = ${scope.matchId} ${scope.gameId ? sql`and g.id = ${scope.gameId}` : sql``}`
          }
    ), valid_games as (select * from scoped_games where valid)`;
}

export const completedBo3 = sql`series_results as (
    select match_id, winner_team_id = team_a_id as winner_a,
           array_agg(won_a = (winner_team_id = team_a_id) order by game_number) as winning_sets
    from scoped_games
    where best_of = 3 and match_status = 'completed' and winner_team_id in (team_a_id, team_b_id)
    group by match_id, winner_team_id, team_a_id
    having bool_and(valid) and min(game_number) = 1 and max(game_number) = count(*)
), completed_bo3 as (
    select * from series_results where winning_sets in (
        array[true,true], array[true,false,true], array[false,true,true]
    )
)`;
