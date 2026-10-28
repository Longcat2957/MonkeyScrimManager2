import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRoflGame, ROFL_PROJECTION_VERSION, ROFL_STAT_FIELDS } from '../src/lib/server/rofl/projection.ts';

// Deliberately authored fixture and expectations, independent of the production field map.
const sourceStats = {
	CHAMPIONS_KILLED: '3', NUM_DEATHS: '2', ASSISTS: '7', MINIONS_KILLED: '120', NEUTRAL_MINIONS_KILLED: '8',
	TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: '1002', TOTAL_DAMAGE_TAKEN: '2002', GOLD_EARNED: '8000',
	VISION_SCORE: '25', WARD_PLACED: '6', WARD_KILLED: '3', VISION_WARDS_BOUGHT_IN_GAME: '2', LEVEL: '15',
	PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS: '600', MAGIC_DAMAGE_DEALT_TO_CHAMPIONS: '300', TRUE_DAMAGE_DEALT_TO_CHAMPIONS: '100',
	PHYSICAL_DAMAGE_TAKEN: '1000', MAGIC_DAMAGE_TAKEN: '700', TRUE_DAMAGE_TAKEN: '300',
	TOTAL_HEAL: '500', TOTAL_HEAL_ON_TEAMMATES: '200', TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES: '300',
	TIME_CCING_OTHERS: '27', TOTAL_TIME_CROWD_CONTROL_DEALT: '1001',
	TOTAL_TIME_CROWD_CONTROL_DEALT_TO_CHAMPIONS: '88', TOTAL_TIME_SPENT_DEAD: '157',
	DOUBLE_KILLS: '2', TRIPLE_KILLS: '1', QUADRA_KILLS: '0', PENTA_KILLS: '0',
	KILLING_SPREES: '3', LARGEST_KILLING_SPREE: '6', LARGEST_MULTI_KILL: '3'
};
const expectedStats = {
	kills: 3, deaths: 2, assists: 7, minionsKilled: 120, neutralMinionsKilled: 8,
	damageDealtToChampions: 1002, damageTaken: 2002, goldEarned: 8000,
	visionScore: 25, wardsPlaced: 6, wardsKilled: 3, controlWardsBought: 2, level: 15,
	physicalDamageDealtToChampions: 600, magicDamageDealtToChampions: 300, trueDamageDealtToChampions: 100,
	physicalDamageTaken: 1000, magicDamageTaken: 700, trueDamageTaken: 300,
	totalHeal: 500, healOnTeammates: 200, damageShieldedOnTeammates: 300,
	timeCcingOthers: 27, totalTimeCrowdControlDealt: 1001,
	totalTimeCrowdControlDealtToChampions: 88, totalTimeSpentDead: 157,
	doubleKills: 2, tripleKills: 1, quadraKills: 0, pentaKills: 0,
	killingSprees: 3, largestKillingSpree: 6, largestMultiKill: 3
};
const sourceLoadout = {
	ITEM0: '1001', ITEM1: '2003', ITEM2: '0', ITEM3: '3051', ITEM4: '0', ITEM5: '0', ITEM6: '3340',
	SUMMONER_SPELL_1: '4', SUMMONER_SPELL_2: '14', PERK_PRIMARY_STYLE: '8000', PERK_SUB_STYLE: '8300',
	PERK0: '8005', PERK1: '8009', PERK2: '9104', PERK3: '8014', PERK4: '8345', PERK5: '8347',
	STAT_PERK_0: '5008', STAT_PERK_1: '5008', STAT_PERK_2: '5002'
};

function replay(players: Record<string, unknown>[], extras: Record<string, unknown> = {}): Buffer {
	const version = Buffer.from('16.21.829.8620');
	const header = Buffer.alloc(15 + version.length);
	header.write('RIOT');
	header.writeUInt16LE(2, 4);
	header[14] = version.length;
	version.copy(header, 15);
	const metadata = Buffer.from(JSON.stringify({ gameLength: 1_800_125, statsJson: JSON.stringify(players), ...extras }));
	const footer = Buffer.alloc(4);
	footer.writeUInt32LE(metadata.length);
	// Summary projection needs no packet interpretation; these body/signature bytes are synthetic.
	return Buffer.concat([header, Buffer.alloc(32, 0x42), Buffer.alloc(256, 0x7f), metadata, footer]);
}

test('P0 through P2 project to explicit typed fields without changing the input bytes', () => {
	const bytes = replay([{
		...sourceStats, ...sourceLoadout,
		RIOT_ID_GAME_NAME: '테스트 참가자', RIOT_ID_TAG_LINE: '0012', PUUID: 'synthetic-replay-id',
		SKIN: 'Ahri', TEAM: '100', WIN: 'Win'
	}, { TEAM: '200', WIN: 'Fail' }]);
	const padded = Buffer.concat([Buffer.alloc(11), bytes, Buffer.alloc(7)]);
	const before = Buffer.from(padded);
	const result = projectRoflGame(padded.subarray(11, 11 + bytes.length));
	assert.equal(ROFL_PROJECTION_VERSION, 1);
	assert.equal(result.projectionVersion, 1);
	assert.equal(result.formatVersion, 2);
	assert.equal(result.gameVersion, '16.21.829.8620');
	assert.equal(result.gameLengthMs, 1_800_125);
	assert.deepEqual(result.participants[0], {
		index: 0, riotId: { gameName: '테스트 참가자', tagLine: '0012' }, replayPuuid: 'synthetic-replay-id',
		champion: 'Ahri', teamId: 100, win: true, stats: expectedStats,
		loadout: {
			itemIds: [1001, 2003, 0, 3051, 0, 0, 3340], summonerSpellIds: [4, 14],
			primaryRuneStyleId: 8000, secondaryRuneStyleId: 8300,
			runeIds: [8005, 8009, 9104, 8014, 8345, 8347], statRuneIds: [5008, 5008, 5002]
		}
	});
	assert.deepEqual(result.teams, [{ teamId: 100, win: true }, { teamId: 200, win: false }]);
	assert.deepEqual(result.result, { status: 'consistent', winnerTeamId: 100 });
	assert.deepEqual(padded, before);
});

test('unselected metadata, derived statistics and service identifiers never enter the projection', () => {
	const source = {
		TEAM: '100', WIN: 'Win', MINIONS_KILLED: '10', NEUTRAL_MINIONS_KILLED: '2',
		UNKNOWN_FIELD: { value: 9 }, Missions_GoldPerMinute: '123', INDIVIDUAL_POSITION: 'TOP',
		PERK0_VAR1: '999', SUMMON_SPELL1_CAST: '18', BARON_KILLS: '2',
		guildId: 'untrusted-guild', matchId: 'untrusted-match', gameId: 'untrusted-game', playerId: 'untrusted-player'
	};
	const projected = projectRoflGame(replay([source], { customMetadata: 'unselected', gameId: 'untrusted-game' }));
	assert.deepEqual(Object.keys(projected).sort(), ['formatVersion', 'gameLengthMs', 'gameVersion', 'participants', 'projectionVersion', 'result', 'teams']);
	assert.deepEqual(Object.keys(projected.participants[0]).sort(), ['champion', 'index', 'loadout', 'replayPuuid', 'riotId', 'stats', 'teamId', 'win']);
	assert.deepEqual(Object.keys(projected.participants[0].stats).sort(), Object.keys(expectedStats).sort());
	const serialized = JSON.stringify(projected);
	for (const forbidden of ['UNKNOWN_FIELD', 'Missions_', 'INDIVIDUAL_POSITION', 'PERK0_VAR1', 'SUMMON_SPELL1_CAST', 'BARON_KILLS', 'untrusted-', 'creepScore', 'kdaRatio', 'customMetadata']) {
		assert.equal(serialized.includes(forbidden), false, forbidden);
	}
});

test('missing fields remain null while zero statistics and loadout slots retain their positions', () => {
	const [empty, partial] = projectRoflGame(replay([{}, {
		CHAMPIONS_KILLED: 0, NUM_DEATHS: '0', ASSISTS: null, GOLD_EARNED: '', VISION_SCORE: '0012',
		ITEM0: '0', ITEM2: '17', ITEM4: 0, SUMMONER_SPELL_2: '4',
		PERK1: '8009', STAT_PERK_2: '5002', RIOT_ID_TAG_LINE: '0012'
	}])).participants;
	assert.deepEqual(empty.stats, Object.fromEntries(Object.keys(expectedStats).map((key) => [key, null])));
	assert.deepEqual(empty.loadout, {
		itemIds: [null, null, null, null, null, null, null], summonerSpellIds: [null, null],
		primaryRuneStyleId: null, secondaryRuneStyleId: null,
		runeIds: [null, null, null, null, null, null], statRuneIds: [null, null, null]
	});
	assert.deepEqual(empty.riotId, { gameName: null, tagLine: null });
	assert.equal(empty.replayPuuid, null);
	assert.equal(empty.champion, null);
	assert.equal(empty.teamId, null);
	assert.equal(empty.win, null);
	assert.equal(partial.stats.kills, 0);
	assert.equal(partial.stats.deaths, 0);
	assert.equal(partial.stats.assists, null);
	assert.equal(partial.stats.goldEarned, null);
	assert.equal(partial.stats.visionScore, 12);
	assert.deepEqual(partial.loadout.itemIds, [0, null, 17, null, 0, null, null]);
	assert.deepEqual(partial.loadout.summonerSpellIds, [null, 4]);
	assert.deepEqual(partial.loadout.runeIds, [null, 8009, null, null, null, null]);
	assert.deepEqual(partial.loadout.statRuneIds, [null, null, 5002]);
	assert.equal(partial.riotId.tagLine, '0012');
});

test('present invalid numbers cannot silently become valid statistics or equipment IDs', () => {
	const invalidValues = ['12oops', '-1', '1e2', '1.5', ' 12', true, {}, [], -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '9007199254740993'];
	for (const key of [...Object.keys(sourceStats), ...Object.keys(sourceLoadout), 'TEAM']) {
		for (const value of invalidValues) {
			assert.throws(() => projectRoflGame(replay([{ [key]: value }])), { code: 'INVALID_METADATA' }, `${key}: ${JSON.stringify(value)}`);
		}
	}
	for (const changed of [{ RIOT_ID_GAME_NAME: 3 }, { PUUID: {} }, { SKIN: false }, { WIN: true }]) {
		assert.throws(() => projectRoflGame(replay([changed])), { code: 'INVALID_METADATA' });
	}
});

test('damage totals and component values remain independent and time counters are not converted', () => {
	const { stats } = projectRoflGame(replay([sourceStats])).participants[0];
	assert.equal(stats.damageDealtToChampions, 1002);
	assert.equal(stats.physicalDamageDealtToChampions, 600);
	assert.equal(stats.magicDamageDealtToChampions, 300);
	assert.equal(stats.trueDamageDealtToChampions, 100);
	assert.equal(stats.damageTaken, 2002);
	assert.equal(stats.physicalDamageTaken, 1000);
	assert.equal(stats.magicDamageTaken, 700);
	assert.equal(stats.trueDamageTaken, 300);
	assert.equal(stats.timeCcingOthers, 27);
	assert.equal(stats.totalTimeCrowdControlDealt, 1001);
	assert.equal(stats.totalTimeCrowdControlDealtToChampions, 88);
	assert.equal(stats.totalTimeSpentDead, 157);
	assert.equal(ROFL_STAT_FIELDS.timeCcingOthers.source, 'TIME_CCING_OTHERS');
	assert.equal(ROFL_STAT_FIELDS.totalTimeCrowdControlDealt.source, 'TOTAL_TIME_CROWD_CONTROL_DEALT');
	assert.equal(ROFL_STAT_FIELDS.totalTimeCrowdControlDealtToChampions.source, 'TOTAL_TIME_CROWD_CONTROL_DEALT_TO_CHAMPIONS');
	assert.equal(ROFL_STAT_FIELDS.totalTimeSpentDead.source, 'TOTAL_TIME_SPENT_DEAD');
	assert.equal(ROFL_STAT_FIELDS.timeCcingOthers.unit, 'unverified');
	assert.equal(ROFL_STAT_FIELDS.totalTimeCrowdControlDealt.unit, 'unverified');
	assert.equal(ROFL_STAT_FIELDS.totalTimeCrowdControlDealtToChampions.unit, 'unverified');
	assert.equal(ROFL_STAT_FIELDS.totalTimeSpentDead.unit, 'unverified');
});

test('incomplete or contradictory team results never yield a trusted winner', () => {
	const cases: [Record<string, unknown>[], 'incomplete' | 'conflicting'][] = [
		[[{ TEAM: '100', WIN: 'Win' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Fail' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '200' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '200', WIN: 'Unknown result' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Win' }, { WIN: 'Fail' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '100' }, { TEAM: '200', WIN: 'Fail' }], 'incomplete'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '100', WIN: 'Fail' }, { TEAM: '200', WIN: 'Fail' }], 'conflicting'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '200', WIN: 'Win' }], 'conflicting'],
		[[{ TEAM: '100', WIN: 'Fail' }, { TEAM: '200', WIN: 'Fail' }], 'conflicting'],
		[[{ TEAM: '100', WIN: 'Win' }, { TEAM: '200', WIN: 'Win' }, {}], 'conflicting']
	];
	for (const [players, status] of cases) {
		assert.deepEqual(projectRoflGame(replay(players)).result, { status, winnerTeamId: null });
	}
	const partial = projectRoflGame(replay([{ TEAM: '200', WIN: 'Fail' }, { TEAM: '100', WIN: 'Win' }, { TEAM: '100' }, {}]));
	assert.deepEqual(partial.teams, [{ teamId: 100, win: null }, { teamId: 200, win: false }]);
	assert.equal(partial.participants[3].teamId, null);
});

test('twenty participants retain their input order while team membership comes from the source', () => {
	const players = Array.from({ length: 20 }, (_, index) => ({ TEAM: index % 2 ? '100' : '200', WIN: index % 2 ? 'Win' : 'Fail' }));
	const result = projectRoflGame(replay(players));
	assert.equal(result.participants.length, 20);
	assert.deepEqual(result.participants.map(({ index }) => index), Array.from({ length: 20 }, (_, index) => index));
	assert.deepEqual(result.participants.map(({ teamId }) => teamId), [200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100]);
	assert.deepEqual(result.result, { status: 'consistent', winnerTeamId: 100 });
	const alternateTeamIds = projectRoflGame(replay([{ TEAM: '9', WIN: 'Win' }, { TEAM: '7', WIN: 'Fail' }]));
	assert.deepEqual(alternateTeamIds.teams, [{ teamId: 7, win: false }, { teamId: 9, win: true }]);
	assert.deepEqual(alternateTeamIds.result, { status: 'consistent', winnerTeamId: 9 });
});
