/** 실제 계정이나 원본 파일 없이 파서에 입력할 ROFL2 종료 메타데이터를 만든다. */
export function replayBytes(
    players: Record<string, unknown>[],
    options: {
        gameLengthMs?: number;
        bodyByte?: number;
        bodyBytes?: number;
        metadata?: Record<string, unknown>;
    } = {}
): Buffer {
    const version = Buffer.from('16.21.829.8620');
    const header = Buffer.alloc(15 + version.length);
    header.write('RIOT');
    header.writeUInt16LE(2, 4);
    header[14] = version.length;
    version.copy(header, 15);
    const metadata = Buffer.from(
        JSON.stringify({
            gameLength: options.gameLengthMs ?? 1_800_125,
            statsJson: JSON.stringify(players),
            ...options.metadata
        })
    );
    const footer = Buffer.alloc(4);
    footer.writeUInt32LE(metadata.length);
    return Buffer.concat([
        header,
        Buffer.alloc(options.bodyBytes ?? 32, options.bodyByte ?? 0x42),
        Buffer.alloc(256, 0x7f),
        metadata,
        footer
    ]);
}

/** 기대 필드는 생산 코드의 필드 목록에서 생성하지 않고 독립적으로 지정한다. */
export function replayPlayer(gameName: string, tagLine: string, index: number, winning = true) {
    return {
        RIOT_ID_GAME_NAME: gameName,
        RIOT_ID_TAG_LINE: tagLine,
        PUUID: '원본-PUUID는-Riot-API-계정키가-아님-' + index,
        SKIN: ['Ahri', 'Garen', 'Lux', 'Ashe', 'Braum', 'Darius', 'LeeSin', 'Orianna', 'Jinx', 'Nautilus'][
            index % 10
        ],
        TEAM: index < 5 ? '100' : '200',
        TEAM_POSITION: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][index % 5],
        WIN: index < 5 === winning ? 'Win' : 'Fail',
        CHAMPIONS_KILLED: String(index),
        NUM_DEATHS: '2',
        ASSISTS: '7',
        MINIONS_KILLED: '120',
        NEUTRAL_MINIONS_KILLED: '8',
        TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: '12000',
        TOTAL_DAMAGE_TAKEN: '9000',
        GOLD_EARNED: '8000',
        VISION_SCORE: '25',
        ITEM0: '0',
        ITEM1: '1001',
        SUMMONER_SPELL_1: '4',
        SUMMONER_SPELL_2: '14'
    };
}
