import type { LolPosition, RankingEntry } from '#lib/features/guild/types.ts';

// 서버 순위 목 데이터. 아이콘 주소는 서버가 Data Dragon 버전으로 만들도록 챔피언 ID만 둔다.
// 무한 스크롤을 확인할 수 있도록 고정 인원 뒤에 이름을 조합한 인원을 덧붙인다.
type MockRecord = { mmr: number; games: number; wins: number; championId: string };
type MockPlayer = { userId: string; displayName: string; records: Partial<Record<LolPosition, MockRecord>> };

export type MockRankingEntry = Omit<RankingEntry, 'iconUrl'> & { championId: string };

const SEASON_NAME = '2026 시즌 2';
const POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const fixedPlayers: MockPlayer[] = [
	{ userId: 'devUser001', displayName: '개발자', records: { mid: { mmr: 1584, games: 21, wins: 12, championId: 'Ahri' }, top: { mmr: 1702, games: 14, wins: 10, championId: 'Camille' } } },
	{ userId: 'u02', displayName: '바나나우유', records: { mid: { mmr: 1768, games: 32, wins: 22, championId: 'Syndra' }, jungle: { mmr: 1611, games: 9, wins: 5, championId: 'LeeSin' } } },
	{ userId: 'u03', displayName: '정글은차이', records: { jungle: { mmr: 1803, games: 41, wins: 28, championId: 'Viego' } } },
	{ userId: 'u04', displayName: '원딜은억울해', records: { bot: { mmr: 1722, games: 30, wins: 19, championId: 'Jinx' } } },
	{ userId: 'u05', displayName: '서폿장인 몽키', records: { support: { mmr: 1690, games: 36, wins: 21, championId: 'Thresh' } } },
	{ userId: 'u06', displayName: '탑신병자', records: { top: { mmr: 1745, games: 27, wins: 18, championId: 'Darius' } } },
	{ userId: 'u07', displayName: '미드갱좀', records: { mid: { mmr: 1702, games: 25, wins: 15, championId: 'Yasuo' }, top: { mmr: 1560, games: 8, wins: 4, championId: 'Garen' } } },
	{ userId: 'u08', displayName: '와드박는기계', records: { support: { mmr: 1655, games: 29, wins: 17, championId: 'Lulu' }, jungle: { mmr: 1580, games: 7, wins: 4, championId: 'Amumu' } } },
	{ userId: 'u09', displayName: '홍길동', records: { mid: { mmr: 1660, games: 18, wins: 11, championId: 'Zed' }, bot: { mmr: 1648, games: 20, wins: 11, championId: 'Ezreal' } } },
	{ userId: 'u10', displayName: '아주아주긴닉네임을쓰는사람', records: { mid: { mmr: 1621, games: 16, wins: 9, championId: 'Orianna' }, top: { mmr: 1688, games: 22, wins: 13, championId: 'Fiora' } } },
	{ userId: 'u11', displayName: '칼바람전문', records: { mid: { mmr: 1604, games: 12, wins: 7, championId: 'Lux' }, bot: { mmr: 1702, games: 24, wins: 15, championId: 'Kaisa' } } },
	{ userId: 'u12', displayName: '쌀숭이', records: { jungle: { mmr: 1702, games: 19, wins: 12, championId: 'Kindred' }, support: { mmr: 1622, games: 15, wins: 8, championId: 'Nautilus' }, top: { mmr: 1650, games: 11, wins: 6, championId: 'Ornn' } } }
];

const CHAMPIONS: Record<LolPosition, string[]> = {
	top: ['Jax', 'Garen', 'Malphite', 'Sett', 'Renekton', 'Shen'],
	jungle: ['Vi', 'Graves', 'Khazix', 'Ekko', 'Hecarim', 'Warwick'],
	mid: ['Annie', 'Veigar', 'Katarina', 'Akali', 'Viktor', 'Galio'],
	bot: ['Caitlyn', 'Ashe', 'MissFortune', 'Vayne', 'Lucian', 'Jhin'],
	support: ['Leona', 'Soraka', 'Morgana', 'Blitzcrank', 'Nami', 'Pyke']
};
const PREFIX = ['새벽', '점멸', '협곡', '바론', '용', '포탑', '미니언', '라인', '부쉬', '와드'];
const SUFFIX = ['장인', '지킴이', '요정', '도둑', '러버', '수집가'];

// 같은 결과가 나오도록 고정 시드의 의사 난수를 쓴다.
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const generatedPlayers: MockPlayer[] = Array.from({ length: 48 }, (_, index) => {
	const positions = POSITIONS.filter(() => random() < 0.45);
	const records: MockPlayer['records'] = {};
	for (const position of positions.length ? positions : [POSITIONS[index % 5]]) {
		const games = 3 + Math.floor(random() * 25);
		records[position] = {
			mmr: Math.round(1380 + random() * 260),
			games,
			wins: Math.floor(games * (0.3 + random() * 0.4)),
			championId: CHAMPIONS[position][Math.floor(random() * 6)]
		};
	}
	return {
		userId: `g${index + 1}`,
		displayName: `${PREFIX[index % PREFIX.length]}${SUFFIX[Math.floor(index / PREFIX.length) % SUFFIX.length]}${index >= 60 ? index : ''}`,
		records
	};
});

const players = [...fixedPlayers, ...generatedPlayers];

function rankPosition(position: LolPosition, userId: string | null): MockRankingEntry[] {
	return players
		.flatMap((player) => {
			const record = player.records[position];
			return record ? [{ userId: player.userId, displayName: player.displayName, ...record }] : [];
		})
		.sort((a, b) => b.mmr - a.mmr)
		.map((entry, index) => ({ ...entry, rank: index + 1, isMe: entry.userId === userId }));
}

export async function getMockRankingPage(
	guildId: string,
	position: LolPosition,
	{ offset, limit, userId }: { offset: number; limit: number; userId: string | null }
) {
	if (guildId !== 'devGuild001') return null;
	const ranked = rankPosition(position, userId);
	return {
		seasonName: SEASON_NAME,
		entries: ranked.slice(offset, offset + limit),
		hasMore: offset + limit < ranked.length,
		me: ranked.find((entry) => entry.isMe) ?? null
	};
}
