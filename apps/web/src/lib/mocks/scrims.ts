import type { LolPosition } from '#lib/features/guild/types.ts';
import type { AuctionStatus } from '#lib/features/scrims/formation.ts';
import { playCapacity } from '#lib/features/scrims/settings.ts';
import type {
    FormationMethod,
    MyRegistration,
    RegistrationStatus,
    ScrimContext,
    ScrimListItem,
    ScrimMember,
    ScrimParticipant,
    ScrimRegistrationCounts,
    ScrimSettings,
    ScrimStatus,
    ScrimStatusFilter
} from '#lib/features/scrims/types.ts';
import { mockAvatarUrl } from './avatar.ts';
import { mockUser } from './session.ts';
import { mockScrimPlayers } from './scrim-players.ts';
import {
    cancelMockAuctionResults,
    getMockAuction,
    getMockAuctionStatus,
    reopenMockFormation,
    setMockAuctionStatus
} from './teams.ts';

// 개발 서버가 살아 있는 동안 유지되는 내전 목 저장소다. 실제 DB 연결 전까지 사용한다.

const LATENCY_MS = 400;
const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

export type MockFailure = { status: number; message: string };

// mmr은 현재 시즌의 포지션별 값이다(초기값 1500). 팀 편성·경매 화면이 사용한다.
export type MockParticipant = Omit<ScrimParticipant, 'iconUrl'> & {
    riotAccountId: string | null;
    mmr: Record<LolPosition, number>;
};

// 편성 방식은 모집을 마감할 때 정해지고 모집을 다시 열면 비워진다.
export type MockScrim = ScrimSettings & {
    formationMethod: FormationMethod | null;
    guildId: string;
    id: string;
    status: ScrimStatus;
    cancelledFromStatus?: ScrimStatus | null;
    cancelledAuctionStatus?: AuctionStatus | null;
    endedEarlyFromStatus?: ScrimStatus | null;
    fullCancellation?: { gameCount: number; restored: boolean };
    canManage: boolean;
    createdAt: string;
    participants: MockParticipant[];
};

const POSITION_SETS: LolPosition[][] = [
    ['mid', 'top'],
    ['jungle'],
    ['support'],
    ['bot'],
    ['top'],
    ['mid'],
    ['jungle', 'support'],
    ['bot', 'mid']
];

// 목록 행·요약에서 상태 표현을 확인할 수 있도록 참가자 상태를 순서대로 배정한다.
function participants(scrimId: string, statuses: RegistrationStatus[]): MockParticipant[] {
    return statuses.map((status, index) => ({
        registrationId: `${scrimId}-r${index + 1}`,
        ...mockScrimPlayers[index]!,
        riotId: index % 3 === 0 ? `${mockScrimPlayers[index]!.displayName}#KR${index + 1}` : null,
        riotAccountId: `${scrimId}-acc${index + 1}`,
        positions: POSITION_SETS[index % POSITION_SETS.length]!,
        status,
        registeredAt: new Date(Date.UTC(2026, 9, 20, 3, index * 7)).toISOString(),
        mmr: mockMmr(index)
    }));
}

const MMR_POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// 사람마다 주 포지션은 높고 나머지는 낮게, 같은 입력이면 항상 같은 값이 나오게 만든다.
function mockMmr(index: number): Record<LolPosition, number> {
    const main = POSITION_SETS[index % POSITION_SETS.length]!;
    return Object.fromEntries(
        MMR_POSITIONS.map((position, order) => [
            position,
            1500 + (main.includes(position) ? 120 : -60) + (((index + 3) * (order + 7) * 37) % 140) - 70
        ])
    ) as Record<LolPosition, number>;
}

const repeat = (status: RegistrationStatus, count: number): RegistrationStatus[] => Array(count).fill(status);

// 내 신청을 목록 맨 앞 참가자 자리에 넣는다.
function withMe(list: MockParticipant[], status: RegistrationStatus): MockParticipant[] {
    const [first, ...rest] = list;
    if (!first) return list;
    return [
        {
            ...first,
            userId: mockUser.userId,
            displayName: mockUser.displayName,
            riotId: 'Hide on bush#KR1',
            riotAccountId: 'acc1',
            status
        },
        ...rest
    ];
}

// 편성 방식별 진입과 서버 홈의 상태 표현을 확인할 수 있도록 상태·일정·내 신청을 섞어 둔다.
const scrims: MockScrim[] = [
    {
        guildId: 'devGuild001',
        id: 'devScrim001',
        title: '10월 정기 내전',
        status: 'recruit',
        scheduledAt: '2026-10-31T11:00:00Z',
        teamCount: 2,
        reserveCapacity: 2,
        formationMethod: null,
        hardFearless: true,
        canManage: true,
        createdAt: '2026-10-20T00:00:00Z',
        // 선발 10 · 대기 1 · 철회 1 · 제외 1 → 활성 11/12명. 선발이 다 차서 바로 모집을 마감할 수 있다.
        participants: withMe(
            participants('devScrim001', [...repeat('selected', 10), 'standby', 'withdrawn', 'excluded']),
            'selected'
        )
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim002',
        title: '경매 내전',
        status: 'preparing',
        scheduledAt: '2026-11-02T12:00:00Z',
        teamCount: 4,
        reserveCapacity: 0,
        formationMethod: 'auction',
        hardFearless: false,
        canManage: true,
        createdAt: '2026-10-22T00:00:00Z',
        participants: withMe(participants('devScrim002', repeat('selected', 20)), 'selected')
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim003',
        title: '방식 미정 내전',
        status: 'recruit',
        scheduledAt: null,
        teamCount: 2,
        reserveCapacity: 4,
        formationMethod: null,
        hardFearless: false,
        canManage: false,
        createdAt: '2026-10-29T00:00:00Z',
        participants: participants('devScrim003', repeat('selected', 3))
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim004',
        title: '금요일 칼바람 나락 내전 (초보 환영, 즐겜 위주)',
        status: 'in_progress',
        scheduledAt: '2026-10-30T12:00:00Z',
        teamCount: 2,
        reserveCapacity: 2,
        formationMethod: 'manual',
        hardFearless: false,
        // 결승 1:1에서 중도 종료·되돌리기를 확인할 수 있게 운영 권한을 둔다.
        canManage: true,
        createdAt: '2026-10-25T00:00:00Z',
        participants: withMe(
            participants('devScrim004', ['standby', ...repeat('selected', 10), 'standby']),
            'standby'
        ).reverse()
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim005',
        title: '10월 3주차 정기 내전',
        status: 'completed',
        scheduledAt: '2026-10-24T11:00:00Z',
        teamCount: 4,
        reserveCapacity: 0,
        formationMethod: 'auction',
        hardFearless: true,
        canManage: false,
        createdAt: '2026-10-15T00:00:00Z',
        participants: withMe(participants('devScrim005', repeat('selected', 20)), 'selected').reverse()
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim006',
        title: '마감 직전 주말 내전',
        status: 'recruit',
        scheduledAt: '2026-11-01T10:00:00Z',
        teamCount: 2,
        reserveCapacity: 0,
        formationMethod: null,
        hardFearless: false,
        canManage: false,
        createdAt: '2026-10-26T00:00:00Z',
        participants: participants('devScrim006', repeat('selected', 10))
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim007',
        title: '수동 편성 내전',
        status: 'preparing',
        scheduledAt: '2026-11-03T11:00:00Z',
        teamCount: 2,
        reserveCapacity: 0,
        formationMethod: 'manual',
        hardFearless: false,
        canManage: true,
        createdAt: '2026-10-27T00:00:00Z',
        participants: withMe(participants('devScrim007', repeat('selected', 10)), 'selected')
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim008',
        title: '4팀 내전',
        status: 'ready',
        scheduledAt: '2026-11-04T11:00:00Z',
        teamCount: 4,
        reserveCapacity: 0,
        formationMethod: 'manual',
        hardFearless: true,
        canManage: true,
        createdAt: '2026-10-28T00:00:00Z',
        // 팀 편성을 확정해 대진 자리 배치부터 직접 조작할 수 있다.
        participants: withMe(participants('devScrim008', repeat('selected', 20)), 'selected')
    },
    {
        guildId: 'devGuild001',
        id: 'devScrim009',
        title: '3팀 경매 내전',
        status: 'ready',
        scheduledAt: '2026-11-06T11:00:00Z',
        teamCount: 3,
        reserveCapacity: 0,
        formationMethod: 'auction',
        hardFearless: false,
        canManage: true,
        createdAt: '2026-10-29T00:00:00Z',
        participants: withMe(participants('devScrim009', repeat('selected', 15)), 'selected')
    },
    // 목록의 종료 필터와 쪽 나눔을 확인하기 위한 지난 내전이다.
    ...Array.from({ length: 19 }, (_, index): MockScrim => {
        const scheduled = new Date(Date.UTC(2026, 9, 17 - index * 3, 11));
        const status: ScrimStatus = index === 4 ? 'cancelled' : index === 9 ? 'ended_early' : 'completed';
        const id = `devScrimPast${String(index + 1).padStart(2, '0')}`;
        let roster = participants(
            id,
            status === 'cancelled' ? repeat('withdrawn', 4) : repeat('selected', 10)
        );
        if (index < 2) roster = withMe(roster, 'selected');
        if (index === 1) [roster[0], roster[2]] = [roster[2]!, roster[0]!];
        return {
            guildId: 'devGuild001',
            id,
            title: `지난 내전 ${19 - index}회`,
            status,
            scheduledAt: scheduled.toISOString(),
            teamCount: 2,
            reserveCapacity: 0,
            formationMethod: index < 2 ? 'auction' : status === 'cancelled' ? null : 'manual',
            hardFearless: index % 2 === 0,
            canManage: false,
            createdAt: new Date(scheduled.getTime() - 7 * 86_400_000).toISOString(),
            participants: roster
        };
    })
];

const ACTIVE: ScrimStatus[] = ['recruit', 'preparing', 'ready', 'in_progress'];
const DONE: ScrimStatus[] = ['completed', 'ended_early', 'cancelled'];
const ACTIVE_REGISTRATION: RegistrationStatus[] = ['selected', 'standby'];

const FILTER: Record<Exclude<ScrimStatusFilter, 'all'>, ScrimStatus[]> = {
    recruit: ['recruit'],
    active: ['preparing', 'ready', 'in_progress'],
    done: DONE
};

// 팀 편성·경매 목(teams.ts)이 같은 저장소를 고쳐 쓰도록 원본 기록을 돌려준다.
export function findMockScrimRecord(guildId: string, scrimId: string) {
    return find(guildId, scrimId);
}

export function listMockAuctionScrims(guildId: string) {
    return scrims.filter(
        (scrim) =>
            scrim.guildId === guildId && scrim.formationMethod === 'auction' && scrim.status !== 'cancelled'
    );
}

function find(guildId: string, scrimId: string) {
    return scrims.find((scrim) => scrim.guildId === guildId && scrim.id === scrimId) ?? null;
}

// 원본 신청 이력은 보존하고, 화면과 인원 계산에는 사람마다 활성 신청 또는 마지막 이력만 사용한다.
function latestRegistrations(scrim: MockScrim): MockParticipant[] {
    const latest = new Map<string, MockParticipant>();
    for (const participant of scrim.participants) {
        const key = participant.userId ?? participant.registrationId;
        const previous = latest.get(key);
        const active = ACTIVE_REGISTRATION.includes(participant.status);
        const previousActive = previous && ACTIVE_REGISTRATION.includes(previous.status);
        if (
            !previous ||
            (active && !previousActive) ||
            (active === previousActive &&
                (participant.registeredAt > previous.registeredAt ||
                    (participant.registeredAt === previous.registeredAt &&
                        participant.registrationId > previous.registrationId)))
        ) {
            latest.set(key, participant);
        }
    }
    return [...latest.values()];
}

const activeRegistrations = (scrim: MockScrim) =>
    latestRegistrations(scrim).filter((participant) => ACTIVE_REGISTRATION.includes(participant.status));

const capacity = (scrim: MockScrim) => playCapacity(scrim.teamCount) + scrim.reserveCapacity;

function myParticipant(scrim: MockScrim, userId: string | null) {
    if (!userId) return null;
    return activeRegistrations(scrim).find((participant) => participant.userId === userId) ?? null;
}

function toContext(scrim: MockScrim): ScrimContext {
    const { id, title, status, scheduledAt, teamCount, formationMethod, hardFearless, canManage } = scrim;
    return {
        id,
        title,
        status,
        scheduledAt,
        teamCount,
        formationMethod,
        hardFearless,
        canManage,
        endedEarlyFromStatus: scrim.endedEarlyFromStatus ?? null
    };
}

export function findMockScrim(guildId: string, scrimId: string): ScrimContext | null {
    const found = find(guildId, scrimId);
    return found ? toContext(found) : null;
}

const MEMBER_PREVIEW = 5;
const MEMBER_ORDER: RegistrationStatus[] = ['selected', 'standby'];

// 목록 행의 얼굴 묶음은 선발된 사람부터 보여 준다.
function members(scrim: MockScrim): ScrimMember[] {
    return activeRegistrations(scrim)
        .toSorted((a, b) => MEMBER_ORDER.indexOf(a.status) - MEMBER_ORDER.indexOf(b.status))
        .slice(0, MEMBER_PREVIEW)
        .map((participant) => ({
            key: participant.registrationId,
            name: participant.displayName,
            iconUrl: mockAvatarUrl(participant.userId)
        }));
}

function toListItem(scrim: MockScrim): ScrimListItem {
    return {
        id: scrim.id,
        title: scrim.title,
        status: scrim.status,
        scheduledAt: scrim.scheduledAt,
        formationMethod: scrim.formationMethod,
        teamCount: scrim.teamCount,
        registered: activeRegistrations(scrim).length,
        capacity: capacity(scrim),
        myRegistration: myParticipant(scrim, mockUser.userId)?.status ?? null,
        members: members(scrim)
    };
}

const bySchedule = (a: MockScrim, b: MockScrim) =>
    (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999');

// 예정 시각이 있는 내전은 지금과 가까운 순으로(다가오는 내전 먼저, 지난 내전은 최근 순), 일정 미정은 생성 최신순으로 뒤에 둔다.
function byListOrder(now: number) {
    const rank = (scrim: MockScrim) => {
        if (!scrim.scheduledAt) return 2;
        return new Date(scrim.scheduledAt).getTime() >= now ? 0 : 1;
    };
    return (a: MockScrim, b: MockScrim) => {
        const diff = rank(a) - rank(b);
        if (diff) return diff;
        if (rank(a) === 0) return bySchedule(a, b);
        if (rank(a) === 1) return bySchedule(b, a);
        return b.createdAt.localeCompare(a.createdAt);
    };
}

export async function listMockScrims(
    guildId: string,
    options: { status: ScrimStatusFilter; page: number; pageSize: number }
) {
    const inGuild = scrims.filter((scrim) => scrim.guildId === guildId);
    const matches = (filter: ScrimStatusFilter) => (scrim: MockScrim) =>
        filter === 'all' || FILTER[filter].includes(scrim.status);
    const filtered = inGuild.filter(matches(options.status)).sort(byListOrder(Date.now()));
    const start = (options.page - 1) * options.pageSize;
    return {
        scrims: filtered.slice(start, start + options.pageSize).map(toListItem),
        total: filtered.length,
        counts: {
            all: inGuild.length,
            recruit: inGuild.filter(matches('recruit')).length,
            active: inGuild.filter(matches('active')).length,
            done: inGuild.filter(matches('done')).length
        } satisfies Record<ScrimStatusFilter, number>
    };
}

function activeScrims(guildId: string) {
    return scrims
        .filter((scrim) => scrim.guildId === guildId && ACTIVE.includes(scrim.status))
        .sort(bySchedule);
}

// 모집부터 진행까지의 내전을 예정 시각이 가까운 순으로, 일정 미정은 뒤에 둔다.
export async function listMockActiveScrims(guildId: string): Promise<ScrimListItem[]> {
    return activeScrims(guildId).map(toListItem);
}

const MY_PRIORITY: RegistrationStatus[] = ['selected', 'standby'];

// 내가 참여하는 내전(선발 > 대기, 같으면 진행 중 > 가까운 일정)을, 없으면 신청할 수 있는 가장 가까운 모집을 고른다.
export async function findMockNextScrim(guildId: string) {
    const active = activeScrims(guildId).map((scrim) => ({
        scrim,
        mine: myParticipant(scrim, mockUser.userId)?.status ?? null
    }));
    const mine = active
        .filter(({ mine }) => mine && MY_PRIORITY.includes(mine))
        .sort(
            (a, b) =>
                MY_PRIORITY.indexOf(a.mine!) - MY_PRIORITY.indexOf(b.mine!) ||
                Number(b.scrim.status === 'in_progress') - Number(a.scrim.status === 'in_progress') ||
                bySchedule(a.scrim, b.scrim)
        )[0];
    const open = active.find(
        ({ scrim, mine }) =>
            scrim.status === 'recruit' && !mine && activeRegistrations(scrim).length < capacity(scrim)
    );
    const picked = (mine ?? open)?.scrim;
    if (!picked) return null;
    return {
        kind: mine ? ('mine' as const) : ('open' as const),
        scrim: toListItem(picked),
        hardFearless: picked.hardFearless
    };
}

export function getMockScrimSettings(guildId: string, scrimId: string): ScrimSettings | null {
    const scrim = find(guildId, scrimId);
    if (!scrim) return null;
    const { title, scheduledAt, teamCount, reserveCapacity, hardFearless } = scrim;
    return { title, scheduledAt, teamCount, reserveCapacity, hardFearless };
}

export function counts(scrim: MockScrim): ScrimRegistrationCounts {
    const latest = latestRegistrations(scrim);
    const count = (status: RegistrationStatus) =>
        latest.filter((participant) => participant.status === status).length;
    return {
        selected: count('selected'),
        standby: count('standby'),
        withdrawn: count('withdrawn'),
        excluded: count('excluded'),
        activeCapacity: capacity(scrim),
        playCapacity: playCapacity(scrim.teamCount)
    };
}

// 선발 자리가 비면 가장 먼저 신청한 대기자부터 채운다. 신청·철회·제외·정원 변경 뒤에 부른다.
function fillSelected(scrim: MockScrim) {
    const limit = playCapacity(scrim.teamCount);
    const standby = scrim.participants
        .filter((participant) => participant.status === 'standby')
        .toSorted((a, b) => a.registeredAt.localeCompare(b.registeredAt));
    for (const participant of standby) {
        if (counts(scrim).selected >= limit) break;
        participant.status = 'selected';
    }
}

export async function getMockScrimDetail(guildId: string, scrimId: string, userId: string | null) {
    await wait();
    const scrim = find(guildId, scrimId);
    if (!scrim) return null;
    const mine = myParticipant(scrim, userId);
    const myRegistration: MyRegistration | null = mine
        ? {
              id: mine.registrationId,
              status: mine.status,
              riotAccountId: mine.riotAccountId,
              positions: [...mine.positions]
          }
        : null;
    return {
        participants: latestRegistrations(scrim).map(
            ({ riotAccountId: _, mmr: __, ...participant }): ScrimParticipant => ({
                ...participant,
                iconUrl: mockAvatarUrl(participant.userId)
            })
        ),
        counts: counts(scrim),
        myRegistration,
        previousPositions: [
            ...(scrim.participants.findLast((participant) => participant.userId === userId)?.positions ?? [])
        ]
    };
}

export async function createMockScrim(guildId: string, settings: ScrimSettings) {
    await wait();
    const id = `devScrim${Date.now().toString(36)}`;
    scrims.push({
        ...settings,
        formationMethod: null,
        guildId,
        id,
        status: 'recruit',
        canManage: true,
        createdAt: new Date().toISOString(),
        participants: []
    });
    return id;
}

export async function updateMockScrimSettings(
    guildId: string,
    scrimId: string,
    settings: ScrimSettings
): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (playCapacity(settings.teamCount) < counts(scrim).selected) {
        return { status: 409, message: '선발 인원보다 실출전 정원을 작게 바꿀 수 없어요' };
    }
    Object.assign(scrim, settings);
    if (scrim.status === 'recruit') fillSelected(scrim);
    return null;
}

type RegistrationInput = {
    userId: string;
    displayName: string;
    riotAccountId: string | null;
    riotId: string | null;
    positions: LolPosition[];
};

export async function registerMock(
    guildId: string,
    scrimId: string,
    input: RegistrationInput
): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감됐어요' };
    if (myParticipant(scrim, input.userId)) return { status: 409, message: '이미 신청했어요' };
    if (activeRegistrations(scrim).length >= capacity(scrim))
        return { status: 409, message: '신청 정원이 찼어요' };
    if (
        input.riotAccountId &&
        activeRegistrations(scrim).some((participant) => participant.riotAccountId === input.riotAccountId)
    ) {
        return { status: 409, message: '이 Riot 계정은 이미 신청에 쓰였어요' };
    }
    scrim.participants.push({
        registrationId: `${scrimId}-r${Date.now().toString(36)}`,
        userId: input.userId,
        displayName: input.displayName,
        riotId: input.riotId,
        riotAccountId: input.riotAccountId,
        positions: input.positions,
        // 선발 자리가 남아 있으면 바로 선발, 찼으면 대기다.
        status: counts(scrim).selected < playCapacity(scrim.teamCount) ? 'selected' : 'standby',
        registeredAt: new Date().toISOString(),
        mmr: mockMmr(0)
    });
    return null;
}

export async function updateMockRegistration(
    guildId: string,
    scrimId: string,
    input: RegistrationInput
): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    const mine = scrim && myParticipant(scrim, input.userId);
    if (!scrim || !mine) return { status: 404, message: '신청 기록을 찾을 수 없어요' };
    if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감되어 바꿀 수 없어요' };
    Object.assign(mine, {
        riotAccountId: input.riotAccountId,
        riotId: input.riotId,
        positions: input.positions
    });
    return null;
}

export async function withdrawMock(
    guildId: string,
    scrimId: string,
    userId: string
): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    const mine = scrim && myParticipant(scrim, userId);
    if (!scrim || !mine) return { status: 404, message: '이미 철회된 신청이에요' };
    if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감되어 철회할 수 없어요' };
    mine.status = 'withdrawn';
    fillSelected(scrim);
    return null;
}

export async function setMockParticipantStatus(
    guildId: string,
    scrimId: string,
    registrationIds: string[],
    status: 'selected' | 'standby' | 'excluded'
): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (scrim.status !== 'recruit') return { status: 409, message: '모집이 마감되어 바꿀 수 없어요' };
    const targets = activeRegistrations(scrim).filter((participant) =>
        registrationIds.includes(participant.registrationId)
    );
    if (targets.length !== registrationIds.length)
        return { status: 409, message: '다른 사람이 먼저 변경했어요' };
    if (status === 'selected') {
        const after =
            counts(scrim).selected +
            targets.filter((participant) => participant.status !== 'selected').length;
        const limit = playCapacity(scrim.teamCount);
        if (after > limit)
            return { status: 409, message: `선발 인원은 ${limit}명을 넘을 수 없어요 (선택 후 ${after}명)` };
    }
    for (const participant of targets) participant.status = status;
    // 운영자가 대기로 돌린 사람은 그대로 두고, 제외로 빈 자리만 대기자가 채운다.
    if (status === 'excluded') fillSelected(scrim);
    return null;
}

export async function cancelMockScrim(guildId: string, scrimId: string): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (!scrim.canManage) return { status: 403, message: '내전을 운영할 권한이 없어요' };
    if (scrim.status === 'in_progress') {
        const { cancelMockBracketResults } = await import('./bracket.ts');
        const gameCount = await cancelMockBracketResults(guildId, scrimId);
        reopenMockFormation(scrim);
        if (scrim.formationMethod === 'auction') cancelMockAuctionResults(scrimId);
        scrim.fullCancellation = { gameCount, restored: false };
        scrim.cancelledFromStatus = null;
        scrim.cancelledAuctionStatus = null;
        scrim.status = 'cancelled';
        return null;
    }
    if (!['recruit', 'preparing', 'ready'].includes(scrim.status))
        return { status: 409, message: '경기 시작 전 내전만 취소할 수 있어요' };
    if (scrim.formationMethod === 'auction') await getMockAuction(guildId, scrimId);
    scrim.cancelledFromStatus = scrim.status;
    scrim.cancelledAuctionStatus = getMockAuctionStatus(scrimId);
    if (scrim.cancelledAuctionStatus !== null) setMockAuctionStatus(scrimId, 'cancelled');
    scrim.status = 'cancelled';
    return null;
}

export function mockCancellationRestoreBlock(scrim: MockScrim): string | null {
    if (scrim.status !== 'cancelled') return '취소된 내전만 복구할 수 있어요';
    if (scrim.fullCancellation && !scrim.fullCancellation.restored) return null;
    if (!scrim.cancelledFromStatus || !['recruit', 'preparing', 'ready'].includes(scrim.cancelledFromStatus))
        return '취소 전 단계가 남아 있지 않아 복구할 수 없어요';
    const auction = getMockAuctionStatus(scrim.id);
    if (
        (scrim.cancelledAuctionStatus == null && auction !== null) ||
        (scrim.cancelledAuctionStatus != null && auction !== 'cancelled')
    )
        return '취소 전 경매 상태를 확인할 수 없어 복구할 수 없어요';
    return null;
}

export async function restoreMockCancelledScrim(
    guildId: string,
    scrimId: string
): Promise<MockFailure | null> {
    await wait();
    const scrim = find(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (!scrim.canManage) return { status: 403, message: '내전을 운영할 권한이 없어요' };
    const blocked = mockCancellationRestoreBlock(scrim);
    if (blocked) return { status: 409, message: blocked };
    if (scrim.fullCancellation && !scrim.fullCancellation.restored) {
        if (scrim.formationMethod === 'auction') setMockAuctionStatus(scrimId, 'setup');
        scrim.fullCancellation.restored = true;
        scrim.status = 'preparing';
        return null;
    }
    if (scrim.cancelledAuctionStatus != null) setMockAuctionStatus(scrimId, scrim.cancelledAuctionStatus);
    scrim.status = scrim.cancelledFromStatus!;
    scrim.cancelledFromStatus = null;
    scrim.cancelledAuctionStatus = null;
    return null;
}
