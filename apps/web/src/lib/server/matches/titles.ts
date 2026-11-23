import { sql } from 'drizzle-orm';
import { completedBo3, titleGames } from './title-scope.ts';

export function setTitleQuery(guildId: string, matchId: string, gameId: string) {
    return sql`with ${titleGames(guildId, { matchId, gameId })}, players as (
        select g.game_id, p.scrim_participant_id, p.position, p.side, g.winner_side = p.side as win,
               g.game_length_ms as ms, (r.stats->>'kills')::numeric as kills,
               (r.stats->>'deaths')::numeric as deaths, (r.stats->>'assists')::numeric as assists,
               (r.stats->>'minionsKilled')::numeric + (r.stats->>'neutralMinionsKilled')::numeric as cs,
               (r.stats->>'neutralMinionsKilled')::numeric as jungle_cs,
               (r.stats->>'damageDealtToChampions')::numeric as damage, (r.stats->>'pentaKills')::numeric as pentas
        from valid_games g
        join game_participants p on (p.game_id,p.rofl_metadata_id) = (g.game_id,g.rofl_metadata_id)
        left join rofl_participant_data_v1 r on (r.rofl_metadata_id,r.participant_index) =
                                                 (p.rofl_metadata_id,p.rofl_participant_index)
    ), teams as (
        select side, case when count(*) = 5 and count(kills) = 5 then sum(kills) end as team_kills,
               case when count(*) = 5 and count(damage) = 5 then sum(damage) end as team_damage,
               max(damage) as max_damage
        from players group by side
    ), scored as (
        select p.*, t.team_kills, t.team_damage, opp.team_kills - t.team_kills as kill_deficit,
               p.cs - lane.cs as cs_lead, p.jungle_cs - lane.jungle_cs as jungle_lead,
               (p.kills + p.assists) as takedowns,
               t.team_damage is not null and opp.team_damage is not null and
                 p.damage = greatest(t.max_damage, opp.max_damage) and
                 count(*) over (partition by p.damage) = 1 as solo_damage_leader
        from players p join teams t on t.side = p.side
        left join teams opp on opp.side <> p.side
        left join players lane on lane.side <> p.side and lane.position = p.position
    )
    select game_id, scrim_participant_id, award.id, award.value::text as value
    from scored cross join lateral (values
        ('set-top-diff', win and position = 'top' and cs_lead >= 50, cs_lead),
        ('set-jungle-clear', win and position = 'jungle' and jungle_lead >= 40, jungle_lead),
        ('set-mid-farm', win and position = 'mid' and ms >= 1500000 and cs * 60000 >= ms * 10,
            cs * 60000 / nullif(ms,0)),
        ('set-bot-carry', win and position = 'bot' and team_damage > 0 and damage * 100 >= team_damage * 40,
            damage * 100 / nullif(team_damage,0)),
        ('set-support-assists', win and position = 'support' and kills = 0 and assists >= 15, assists),
        ('set-next-faker', win and ms >= 1800000 and deaths = 0 and team_kills > 0 and takedowns * 100 >= team_kills * 60,
            takedowns * 100 / nullif(team_kills,0)),
        ('set-losing-damage', not win and solo_damage_leader, damage),
        ('set-kill-deficit', win and kill_deficit >= 10, kill_deficit),
        ('set-pentakill', pentas >= 1, pentas),
        ('set-deus-ex-machina', win and team_kills >= 20 and takedowns * 100 >= team_kills * 90,
            takedowns * 100 / nullif(team_kills,0))
    ) award(id, earned, value) where earned order by scrim_participant_id, award.id`;
}

export function seriesTitleQuery(guildId: string, matchId: string) {
    return sql`with ${titleGames(guildId, { matchId })}, ${completedBo3}, players as (
        select g.game_id, g.game_number, s.winning_sets, p.scrim_participant_id, p.position,
               ((p.side = 'blue') = (g.blue_team_slot = 'a')) = s.winner_a as series_winner,
               (r.stats->>'deaths')::numeric as deaths
        from completed_bo3 s join valid_games g using (match_id)
        join game_participants p on (p.game_id,p.rofl_metadata_id) = (g.game_id,g.rofl_metadata_id)
        left join rofl_participant_data_v1 r on (r.rofl_metadata_id,r.participant_index) =
                                                 (p.rofl_metadata_id,p.rofl_participant_index)
    ), comeback as (
        select *, count(*) over () as recipients from players
        where winning_sets = array[false,true,true] and game_number = 3 and series_winner
    ), duo as (
        select * from players where winning_sets = array[true,true] and position in ('bot','support')
    ), winning_duo_sets as (
        select game_id from duo group by game_id
        having count(deaths) = 4 and count(*) filter (where series_winner) = 2
           and sum(deaths) filter (where series_winner) < sum(deaths) filter (where not series_winner)
    ), winning_duo as (
        select scrim_participant_id, count(*) over () as recipients
        from duo join winning_duo_sets using (game_id) where series_winner
        group by scrim_participant_id having count(*) = 2
    )
    select 'bo3-reverse-sweep' as id, scrim_participant_id from comeback where recipients = 5
    union all
    select 'bo3-bot-duo' as id, scrim_participant_id from winning_duo where recipients = 2
    order by scrim_participant_id`;
}
