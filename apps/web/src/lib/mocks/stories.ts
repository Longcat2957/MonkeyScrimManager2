import type { GuildStory } from '#lib/features/guild/types.ts';

// 서버 홈 스토리 목 데이터. 실제로는 게임 결과(연승·연패·역전)와 ROFL 통계(킬 수)에서 뽑는다.
// 배경 아트는 서버가 Data Dragon 주소로 바꾸도록 챔피언 ID만 둔다.
export type MockStory = Omit<GuildStory, 'artUrl'> & { championId: string };

const stories: (MockStory & { guildId: string })[] = [
	{ guildId: 'devGuild001', id: 's1', kind: 'win_streak', userId: 'u02', displayName: '바나나우유', headline: '7연승', detail: '미드 신드라로 7게임 연속 승리 중', championId: 'Syndra' },
	{ guildId: 'devGuild001', id: 's2', kind: 'most_kills', userId: 'u03', displayName: '정글은차이', headline: '한 게임 18킬', detail: '10월 3주차 정기 내전 2게임 · 비에고', championId: 'Viego' },
	{ guildId: 'devGuild001', id: 's3', kind: 'comeback', userId: 'u09', displayName: '홍길동', headline: '0 : 1 → 2 : 1', detail: '미드 차이 팀의 시리즈 역전승을 이끌었어요', championId: 'Zed' },
	{ guildId: 'devGuild001', id: 's4', kind: 'loss_streak', userId: 'u08', displayName: '와드박는기계', headline: '5연패', detail: '다음 내전에서 끊어 낼 차례예요', championId: 'Lulu' },
	{ guildId: 'devGuild001', id: 's5', kind: 'first_win', userId: 'u11', displayName: '칼바람전문', headline: '첫 승', detail: '내전 첫 승리를 거뒀어요', championId: 'Lux' }
];

export async function listMockStories(guildId: string): Promise<MockStory[]> {
	return stories.filter((story) => story.guildId === guildId).map(({ guildId: _, ...story }) => story);
}
