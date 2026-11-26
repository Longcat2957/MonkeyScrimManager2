import type { LolPosition } from '#lib/features/guild/types.ts';
import type { FormationPlayer } from '#lib/features/scrims/formation.ts';

// 소개 화면 체험의 가상 내전. 실제 사용자·서버 데이터가 아니며 운영 빌드에서도 같은 내용을 보여 준다.

export const DEMO_TITLE = '오늘 밤 협곡 내전';
export const DEMO_CAPACITY = 10;
export const VISITOR_ID = 'demo-visitor';
export const VISITOR_NAME = '나';
export const SAMPLE_ROFL_NAME = '오늘밤_1세트.rofl';

type Mmr = Partial<Record<LolPosition, number>>;
export type DemoMember = {
    id: string;
    name: string;
    positions: LolPosition[];
    mmr: Mmr;
    // 시즌 전적. 경매 후보 카드의 요약에 쓴다.
    record: [wins: number, losses: number];
};

// 방문자가 참가하기 전에 이미 신청한 아홉 명이다. 신청 순서대로 둔다.
export const demoMembers: DemoMember[] = [
    {
        id: 'demo-01',
        name: '바위게수호자',
        positions: ['top', 'jungle'],
        mmr: { top: 1532, jungle: 1490 },
        record: [18, 14]
    },
    { id: 'demo-02', name: '탑솔장인', positions: ['top'], mmr: { top: 1608 }, record: [22, 13] },
    { id: 'demo-03', name: '부쉬에서기다림', positions: ['jungle'], mmr: { jungle: 1498 }, record: [15, 16] },
    {
        id: 'demo-04',
        name: '정글러는바빠',
        positions: ['jungle', 'mid'],
        mmr: { jungle: 1612, mid: 1540 },
        record: [19, 12]
    },
    {
        id: 'demo-05',
        name: '미드는내꺼',
        positions: ['mid', 'jungle'],
        mmr: { mid: 1684, jungle: 1521 },
        record: [24, 11]
    },
    { id: 'demo-06', name: '원딜은소중해', positions: ['bot'], mmr: { bot: 1561 }, record: [17, 15] },
    {
        id: 'demo-07',
        name: '포탑허그',
        positions: ['bot', 'support'],
        mmr: { bot: 1477, support: 1502 },
        record: [12, 17]
    },
    { id: 'demo-08', name: '와드한개만', positions: ['support'], mmr: { support: 1577 }, record: [21, 15] },
    {
        id: 'demo-09',
        name: '그랩한방',
        positions: ['support', 'mid'],
        mmr: { support: 1519, mid: 1466 },
        record: [14, 14]
    }
];

export type DemoTeamSeed = {
    id: string;
    name: string;
    captainId: string;
    // 체험 시작 전에 이미 끝난 낙찰. [참가자 ID, 가격]
    sold: [string, number][];
};

export const DEMO_START_POINTS = 1000;

// 팀장 두 명과 앞선 낙찰 다섯 건까지 진행한 경매에서 체험을 시작한다.
export const demoTeams: DemoTeamSeed[] = [
    {
        id: 'demo-team-a',
        name: '포로팀',
        captainId: 'demo-01',
        sold: [
            ['demo-03', 210],
            ['demo-06', 180],
            ['demo-08', 150]
        ]
    },
    {
        id: 'demo-team-b',
        name: '칼날부리팀',
        captainId: 'demo-02',
        sold: [
            ['demo-04', 260],
            ['demo-09', 120]
        ]
    }
];

// 다음 후보로 나오는 순서. 방문자는 두 번째 후보다.
export const demoQueue = ['demo-05', VISITOR_ID, 'demo-07'];

export function formationPlayer(
    member: Pick<DemoMember, 'id' | 'name' | 'positions' | 'mmr'>
): FormationPlayer {
    return {
        participantId: member.id,
        userId: null,
        displayName: member.name,
        iconUrl: null,
        positions: [...member.positions],
        mmr: {
            top: member.mmr.top ?? null,
            jungle: member.mmr.jungle ?? null,
            mid: member.mmr.mid ?? null,
            bot: member.mmr.bot ?? null,
            support: member.mmr.support ?? null
        }
    };
}
