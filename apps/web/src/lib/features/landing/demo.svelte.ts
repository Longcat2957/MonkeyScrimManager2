import type { ActionResult } from '$app/forms';
import {
    DEMO_CAPACITY,
    DEMO_START_POINTS,
    DEMO_TITLE,
    SAMPLE_ROFL_NAME,
    VISITOR_ID,
    VISITOR_NAME,
    demoMembers,
    demoQueue,
    demoTeams,
    formationPlayer,
    type DemoMember
} from '#lib/content/landing.ts';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { POSITIONS } from '#lib/features/labels.ts';
import {
    TEAM_SIZE,
    type AcquisitionVia,
    type AuctionHistoryEntry,
    type AuctionView
} from '#lib/features/scrims/formation.ts';
import type {
    ScrimContext,
    ScrimNextAction,
    ScrimParticipant,
    ScrimRegistrationCounts,
    ScrimStatus
} from '#lib/features/scrims/types.ts';
import { assignLanes, demoGame, demoPreview, type DemoGameTemplate, type DemoLineupTeam } from './game.ts';

// 소개 화면 체험의 브라우저 안 내전. 서버에 저장하지 않으며 실제 업무 컴포넌트가 보내는
// form action을 같은 이름으로 받아 상태를 바꾼다. 규칙은 서버 구현 중 체험에 필요한 부분만 따른다.

type Team = {
    id: string;
    name: string;
    captainId: string;
    members: { id: string; via: AcquisitionVia; price: number | null }[];
};
type AuctionState = {
    status: 'in_progress' | 'completed';
    teams: Team[];
    open: string | null;
    queue: string[];
    unsold: string[];
    history: AuctionHistoryEntry[];
};

const ok = (data?: Record<string, unknown>): ActionResult => ({
    type: 'success',
    status: 200,
    data,
    location: ''
});
const fail = (message: string): ActionResult => ({
    type: 'failure',
    status: 400,
    data: { message },
    location: ''
});

/** 오늘 21시(한국 시각)를 일정으로 쓴다. 이미 지났어도 체험에는 영향이 없다. */
function tonight() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    return `${today}T21:00:00+09:00`;
}

function seedAuction(): AuctionState {
    let order = 0;
    const history: AuctionHistoryEntry[] = [];
    const teams = demoTeams.map((seed) => {
        const members: Team['members'] = [{ id: seed.captainId, via: 'captain', price: null }];
        for (const [id, price] of seed.sold) {
            members.push({ id, via: 'auction', price });
            history.push({
                id: `demo-history-${++order}`,
                order,
                displayName: demoMembers.find((member) => member.id === id)!.name,
                iconUrl: null,
                result: 'sold',
                teamName: seed.name,
                price,
                voided: false
            });
        }
        return { id: seed.id, name: seed.name, captainId: seed.captainId, members };
    });
    return { status: 'in_progress', teams, open: null, queue: [...demoQueue], unsold: [], history };
}

export class DemoScrim {
    stage = $state(0);
    status = $state<ScrimStatus>('recruit');
    positions = $state<LolPosition[]>([]);
    joined = $state(false);
    auction = $state<AuctionState>(seedAuction());
    blueSlot = $state<'a' | 'b' | null>(null);
    template = $state<DemoGameTemplate | null>(null);
    // 마지막 경매 작업 직전 상태. 실제 서비스처럼 새 작업 전에는 한 번만 되돌린다.
    #previous = $state<AuctionState | null>(null);

    readonly scrimId = 'demo-scrim';

    get #visitor(): DemoMember {
        return { id: VISITOR_ID, name: VISITOR_NAME, positions: this.positions, mmr: {}, record: [0, 0] };
    }

    get members(): DemoMember[] {
        return this.joined ? [...demoMembers, this.#visitor] : demoMembers;
    }

    // 참가 전에도 다음 칸의 경매 후보 명단을 그릴 수 있게 방문자를 찾는다.
    member(id: string) {
        return id === VISITOR_ID ? this.#visitor : demoMembers.find((member) => member.id === id)!;
    }

    get scrim(): ScrimContext {
        return {
            id: this.scrimId,
            title: DEMO_TITLE,
            status: this.status,
            scheduledAt: tonight(),
            teamCount: 2,
            formationMethod: 'auction',
            hardFearless: false,
            canManage: true
        };
    }

    get participants(): ScrimParticipant[] {
        return this.members.map((member, index) => ({
            registrationId: member.id,
            userId: null,
            displayName: member.name,
            iconUrl: null,
            riotId: null,
            positions: member.positions,
            status: 'selected',
            registeredAt: new Date(Date.UTC(2026, 0, 1, 11, index)).toISOString()
        }));
    }

    get counts(): ScrimRegistrationCounts {
        const selected = this.members.length;
        return {
            selected,
            standby: 0,
            withdrawn: 0,
            excluded: 0,
            activeCapacity: DEMO_CAPACITY,
            playCapacity: DEMO_CAPACITY
        };
    }

    get nextAction(): ScrimNextAction | null {
        if (this.status !== 'recruit') return null;
        return {
            key: 'close',
            label: '모집 마감',
            blockedReason: this.members.length < DEMO_CAPACITY ? '선발 인원이 부족해요' : null
        };
    }

    get auctionView(): AuctionView {
        const state = this.auction;
        const player = (id: string) => formationPlayer(this.member(id));
        const open = state.open ? this.member(state.open) : null;
        return {
            status: state.status,
            canRevert: Boolean(this.#previous),
            teams: state.teams.map((team) => {
                const spent = team.members.reduce((sum, member) => sum + (member.price ?? 0), 0);
                return {
                    id: team.id,
                    name: team.name,
                    captainId: team.captainId,
                    startPoints: DEMO_START_POINTS,
                    remainingPoints: DEMO_START_POINTS - spent,
                    members: team.members.map((member) => ({
                        player: player(member.id),
                        via: member.via,
                        price: member.price
                    }))
                };
            }),
            players: this.members.map(formationPlayer),
            openLot: open ? formationPlayer(open) : null,
            openLotId: state.open,
            openPriceHistory: null,
            queue: state.queue
                .map(player)
                .toSorted((a, b) => a.displayName.localeCompare(b.displayName, 'ko')),
            unsold: state.unsold.map(player),
            history: state.history,
            openProfile: open
                ? {
                      summary:
                          open.record[0] + open.record[1]
                              ? {
                                    games: open.record[0] + open.record[1],
                                    wins: open.record[0],
                                    losses: open.record[1]
                                }
                              : null,
                      mainLane: open.positions[0] ?? null,
                      championRecords: [],
                      laneGames: null,
                      preferredChampions: [],
                      recentGames: [],
                      riot: null
                  }
                : null
        };
    }

    /** 경매로 꾸린 두 팀의 포지션별 출전자. 경기별 라인업 확정은 체험에서 선호 포지션으로 대신한다. */
    get lineupTeams(): [DemoLineupTeam, DemoLineupTeam] {
        const [a, b] = this.auction.teams.map((team, index): DemoLineupTeam => ({
            slot: index === 0 ? 'a' : 'b',
            name: team.name,
            players: assignLanes(team.members.map((member) => this.member(member.id))).map(
                ({ lane, member }) => ({
                    participantId: member.id,
                    displayName: member.name,
                    position: lane
                })
            )
        }));
        return [a!, b!];
    }

    get result() {
        return this.template && this.blueSlot
            ? demoGame(this.template, this.lineupTeams, this.blueSlot)
            : null;
    }

    /** 모집 글의 참가하기. 실제 봇처럼 처음 신청은 포지션 무관으로 받고 상황판으로 넘어간다. */
    join() {
        this.positions = POSITIONS.map((position) => position.key);
        this.joined = true;
        this.stage = 1;
    }

    reset() {
        this.stage = 0;
        this.status = 'recruit';
        this.positions = [];
        this.joined = false;
        this.auction = seedAuction();
        this.blueSlot = null;
        this.#previous = null;
    }

    /** 실제 업무 컴포넌트가 보내는 form action을 처리한다. */
    submit = async (name: string, body: FormData): Promise<ActionResult> => {
        const field = (key: string) => String(body.get(key) ?? '');
        switch (name) {
            case 'advance':
                if (field('key') !== 'close' || this.nextAction?.blockedReason)
                    return fail('지금은 마감할 수 없어요');
                this.status = 'preparing';
                this.stage = 2;
                return ok();
            case 'preview':
            case 'upload':
                return this.#record(name, body);
            default:
                return this.#auctionAction(name, field);
        }
    };

    #record(name: 'preview' | 'upload', body: FormData): ActionResult {
        const file = body.get('file');
        const slot = body.get('blueTeamSlot');
        if (!(file instanceof File) || file.name !== SAMPLE_ROFL_NAME)
            return fail('체험에서는 준비된 샘플 리플레이만 등록할 수 있어요');
        if ((slot !== 'a' && slot !== 'b') || body.get('blueTeamConfirmed') !== 'true')
            return fail('이 세트의 블루 팀을 확인해 주세요');
        if (!this.template) return fail('샘플 기록을 불러오는 중이에요. 잠시 뒤 다시 시도해 주세요');
        if (name === 'preview') return ok({ preview: demoPreview(this.template, this.lineupTeams, slot) });
        this.blueSlot = slot;
        this.status = 'completed';
        return ok({ order: 1, completed: true });
    }

    #auctionAction(name: string, field: (key: string) => string): ActionResult {
        const state = this.auction;
        if (state.status !== 'in_progress') return fail('경매 편성 중에만 변경할 수 있어요');
        const team = (id: string) => state.teams.find((item) => item.id === id);
        const before = $state.snapshot(state) as AuctionState;
        const commit = () => {
            this.#previous = before;
            return ok();
        };
        const entry = (
            id: string,
            result: AuctionHistoryEntry['result'],
            teamName: string | null,
            price: number | null
        ) => {
            const order = state.history.length + 1;
            state.history.push({
                id: `demo-history-${order}-${Date.now()}`,
                order,
                displayName: this.member(id).name,
                iconUrl: null,
                result,
                teamName,
                price,
                voided: false
            });
        };
        const place = (id: string, teamId: string, price: number | null) => {
            const target = team(teamId);
            if (!target) return '팀을 다시 확인해 주세요';
            if (target.members.length >= TEAM_SIZE) return '이 팀은 정원이 찼어요';
            const spent = target.members.reduce((sum, member) => sum + (member.price ?? 0), 0);
            if (price !== null && price > DEMO_START_POINTS - spent)
                return '남은 포인트보다 높게 낙찰할 수 없어요';
            target.members.push({ id, via: price === null ? 'manual' : 'auction', price });
            entry(id, price === null ? 'manual' : 'sold', target.name, price);
            return null;
        };
        switch (name) {
            case 'draw': {
                if (state.open) return fail('진행 중인 후보를 먼저 처리해 주세요');
                const next = state.queue.shift();
                if (!next) return fail('대기 중인 후보가 없어요');
                state.open = next;
                return commit();
            }
            case 'award':
            case 'assignCurrent': {
                if (!state.open) return fail('현재 후보가 바뀌었어요. 다시 시도해 주세요');
                const price = name === 'award' ? Number(field('price')) : null;
                if (price !== null && (!Number.isInteger(price) || price < 0))
                    return fail('입찰가는 0 이상의 정수로 입력해 주세요');
                const message = place(state.open, field('teamId'), price);
                if (message) return fail(message);
                state.open = null;
                return commit();
            }
            case 'pass':
                if (!state.open) return fail('현재 후보가 바뀌었어요. 다시 시도해 주세요');
                entry(state.open, 'unsold', null, null);
                state.unsold.push(state.open);
                state.open = null;
                return commit();
            case 'assign': {
                const id = field('participantId');
                if (state.open) return fail('진행 중인 후보를 먼저 처리해 주세요');
                if (!state.unsold.includes(id)) return fail('유찰 후보가 바뀌었어요. 다시 시도해 주세요');
                const message = place(id, field('teamId'), null);
                if (message) return fail(message);
                state.unsold = state.unsold.filter((item) => item !== id);
                return commit();
            }
            case 'restore': {
                const id = field('participantId');
                if (state.open) return fail('진행 중인 후보를 먼저 처리해 주세요');
                if (!state.unsold.includes(id)) return fail('유찰 후보가 바뀌었어요. 다시 시도해 주세요');
                state.unsold = state.unsold.filter((item) => item !== id);
                state.open = id;
                return commit();
            }
            case 'revert': {
                const previous = this.#previous;
                if (!previous) return fail('되돌릴 작업이 없어요');
                // 되돌린 기록은 지우지 않고 남긴다.
                const added = state.history
                    .slice(previous.history.length)
                    .map((item) => ({ ...item, voided: true }));
                this.auction = { ...previous, history: [...previous.history, ...added] };
                this.#previous = null;
                return ok();
            }
            case 'reset': {
                // 팀장과 시작 포인트만 남기고 모든 참가자를 다시 대기 후보로 올린다.
                const captains = new Set(state.teams.map((item) => item.captainId));
                this.auction = {
                    status: 'in_progress',
                    teams: state.teams.map((item) => ({
                        ...item,
                        members: [{ id: item.captainId, via: 'captain', price: null }]
                    })),
                    open: null,
                    queue: this.members.map((member) => member.id).filter((id) => !captains.has(id)),
                    unsold: [],
                    history: state.history.map((item) => ({ ...item, voided: true }))
                };
                this.#previous = null;
                return ok();
            }
            case 'confirmFormation':
                if (state.teams.some((item) => item.members.length !== TEAM_SIZE))
                    return fail('모든 팀의 배정을 마친 뒤 확정해 주세요');
                state.status = 'completed';
                this.#previous = null;
                this.status = 'in_progress';
                this.stage = 3;
                return ok();
            default:
                return fail('체험에서는 이 작업을 쓸 수 없어요');
        }
    }
}
