import type { LolPosition } from '#lib/features/guild/types.ts';

// 소개 화면의 장식용 상황판 예시. 실제 사용자·서버 데이터가 아니며 운영 화면에서도 같은 내용을 보여 준다.
export type BoardTeam = {
    name: string;
    side: 'blue' | 'red';
    players: { position: LolPosition; name: string }[];
};
export type BoardSample = { title: string; meta: string[]; teams: [BoardTeam, BoardTeam]; result: string };
export type RecordSample = { name: string; position: LolPosition; mmr: number; record: string }[];

export const boardSample: BoardSample = {
    title: '금요일 밤 협곡 내전',
    meta: ['2팀', '5전 3선승', '하드 피어리스'],
    teams: [
        {
            name: '포로팀',
            side: 'blue',
            players: [
                { position: 'top', name: '바위게수호자' },
                { position: 'jungle', name: '부쉬에서기다림' },
                { position: 'mid', name: '미드는내꺼' },
                { position: 'bot', name: '원딜은소중해' },
                { position: 'support', name: '와드한개만' }
            ]
        },
        {
            name: '칼날부리팀',
            side: 'red',
            players: [
                { position: 'top', name: '탑솔장인' },
                { position: 'jungle', name: '정글러는바빠' },
                { position: 'mid', name: '로밍가요' },
                { position: 'bot', name: '포탑허그' },
                { position: 'support', name: '그랩한방' }
            ]
        }
    ],
    result: '2세트 기록 완료 · 포로팀 2 : 0'
};

export const recordSample: RecordSample = [
    { name: '미드는내꺼', position: 'mid', mmr: 1684, record: '24승 11패' },
    { name: '정글러는바빠', position: 'jungle', mmr: 1612, record: '19승 12패' },
    { name: '와드한개만', position: 'support', mmr: 1577, record: '21승 15패' }
];

export const workflowSteps = [
    { title: '모집', text: 'Discord 모집 글의 버튼으로 신청해요. 웹 가입이나 Riot 계정 연결은 필요 없어요.' },
    { title: '편성', text: '운영자가 포지션 자리에 직접 배치하거나 팀장 경매로 팀을 꾸려요.' },
    { title: '대진', text: '팀 수에 맞는 대진과 경기 방식을 정해요. 밴픽과 경기는 게임에서 진행해요.' },
    { title: '기록', text: '세트가 끝나면 리플레이(ROFL)만 올리세요. 결과와 전적, MMR이 자동으로 쌓여요.' }
];
