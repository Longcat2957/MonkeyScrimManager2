import type {
	AuctionStatus,
	FormationMethod,
	GameStatus,
	LotStatus,
	MatchStatus,
	Position,
	RegistrationStatus,
	ScrimStatus
} from '#lib/data/types.ts';

/*
 * 상태 문구와 톤의 단일 출처.
 * 톤은 "지금 벌어지는 일(live) / 기다리는 일(wait) / 끝난 일(done) / 무효·취소(danger)" 네 가지뿐이다.
 * 색은 보조 신호이며 문구가 항상 함께 읽힌다.
 */

export type Tone = 'live' | 'wait' | 'done' | 'danger';

export interface StatusMeta {
	text: string;
	tone: Tone;
}

export const SCRIM_STATUS: Record<ScrimStatus, StatusMeta> = {
	recruit: { text: '모집 중', tone: 'live' },
	preparing: { text: '편성 중', tone: 'wait' },
	ready: { text: '편성 완료', tone: 'live' },
	in_progress: { text: '진행 중', tone: 'live' },
	completed: { text: '종료', tone: 'done' },
	ended_early: { text: '중도 종료', tone: 'wait' },
	cancelled: { text: '취소', tone: 'danger' }
};

export const REGISTRATION_STATUS: Record<RegistrationStatus, StatusMeta> = {
	pending: { text: '신청', tone: 'wait' },
	selected: { text: '선발', tone: 'live' },
	standby: { text: '대기', tone: 'wait' },
	withdrawn: { text: '철회', tone: 'done' },
	excluded: { text: '제외', tone: 'danger' }
};

export const MATCH_STATUS: Record<MatchStatus, StatusMeta> = {
	pending: { text: '예정', tone: 'wait' },
	in_progress: { text: '진행 중', tone: 'live' },
	completed: { text: '종료', tone: 'done' },
	ended_early: { text: '중도 종료', tone: 'wait' },
	cancelled: { text: '취소', tone: 'danger' }
};

export const GAME_STATUS: Record<GameStatus, StatusMeta> = {
	pending: { text: '예정', tone: 'wait' },
	in_progress: { text: '진행 중', tone: 'live' },
	awaiting_result: { text: '결과 대기', tone: 'wait' },
	completed: { text: '기록됨', tone: 'done' },
	cancelled: { text: '취소', tone: 'danger' }
};

export const AUCTION_STATUS: Record<AuctionStatus, StatusMeta> = {
	setup: { text: '경매 준비', tone: 'wait' },
	in_progress: { text: '입찰 진행', tone: 'live' },
	completed: { text: '경매 완료', tone: 'done' },
	cancelled: { text: '경매 취소', tone: 'danger' }
};

export const LOT_STATUS: Record<LotStatus, StatusMeta> = {
	open: { text: '입찰 중', tone: 'live' },
	sold: { text: '낙찰', tone: 'done' },
	unsold: { text: '유찰', tone: 'wait' },
	cancelled: { text: '취소', tone: 'danger' }
};

/** 포지션 이름. MSM1 사용자 용어(원딜)를 유지한다. */
export const POSITION_LABEL: Record<Position, string> = {
	top: '탑',
	jungle: '정글',
	mid: '미드',
	bot: '원딜',
	support: '서폿'
};

export const FORMATION_LABEL: Record<FormationMethod, string> = {
	manual: '엔트리 편성',
	auction: '경매 편성'
};
