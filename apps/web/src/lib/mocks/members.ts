import { mockPlayers } from './ranking.ts';
import { mockScrimPlayers } from './scrim-players.ts';
import { mockUser } from './session.ts';

// 서버 관리 화면의 멤버·Discord 연동 설정(가변, 재시작 시 초기화). 서비스에 연결된 멤버만 담는다. Riot 계정은 me.ts 저장소에서 붙인다.
// roles·manageGuild는 봇이 Discord에서 동기화한다고 가정한 값이다.
export type MockMember = {
    userId: string;
    displayName: string;
    roles: string[];
    manageGuild: boolean;
    auctionSeedPrice: number | null;
    auctionOverridePrice: number | null;
};

export const mockMembers = new Map<string, MockMember[]>([
    [
        'devGuild001',
        [
            ...mockPlayers.slice(0, 30),
            ...mockScrimPlayers.flatMap((p) =>
                p.userId ? [{ userId: p.userId, displayName: p.displayName }] : []
            )
        ].map(({ userId, displayName }) => ({
            userId,
            displayName,
            auctionSeedPrice: null,
            auctionOverridePrice: null,
            roles:
                userId === mockUser.userId
                    ? ['r-ops', 'r-member']
                    : userId === 'u03'
                      ? ['r-staff', 'r-member']
                      : ['r-member'],
            // 서버장처럼 Discord의 서버 관리 권한이 있는 멤버
            manageGuild: userId === 'u02'
        }))
    ]
]);
