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
 * 화면마다 다른 동의어를 만들지 않는다. 색은 보조 신호이며 문구가 항상 함께 읽힌다.
 */

export type Tone = 'theme' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusMeta {
	text: string;
	tone: Tone;
}

export const SCRIM_STATUS: Record<ScrimStatus, StatusMeta> = {
	recruit: { text: '모집 중', tone: 'info' },
	preparing: { text: '편성 중', tone: 'info' },
	ready: { text: '편성 완료', tone: 'success' },
	in_progress: { text: '진행 중', tone: 'info' },
	completed: { text: '종료', tone: 'neutral' },
	ended_early: { text: '중도 종료', tone: 'warning' },
	cancelled: { text: '취소', tone: 'error' }
};

export const REGISTRATION_STATUS: Record<RegistrationStatus, StatusMeta> = {
	pending: { text: '신청', tone: 'neutral' },
	selected: { text: '선발', tone: 'success' },
	standby: { text: '대기', tone: 'warning' },
	withdrawn: { text: '철회', tone: 'neutral' },
	excluded: { text: '제외', tone: 'error' }
};

export const MATCH_STATUS: Record<MatchStatus, StatusMeta> = {
	pending: { text: '예정', tone: 'neutral' },
	in_progress: { text: '진행 중', tone: 'info' },
	completed: { text: '종료', tone: 'success' },
	ended_early: { text: '중도 종료', tone: 'warning' },
	cancelled: { text: '취소', tone: 'error' }
};

export const GAME_STATUS: Record<GameStatus, StatusMeta> = {
	pending: { text: '예정', tone: 'neutral' },
	in_progress: { text: '진행 중', tone: 'info' },
	awaiting_result: { text: '결과 대기', tone: 'warning' },
	completed: { text: '기록됨', tone: 'success' },
	cancelled: { text: '취소', tone: 'error' }
};

export const AUCTION_STATUS: Record<AuctionStatus, StatusMeta> = {
	setup: { text: '경매 준비', tone: 'neutral' },
	in_progress: { text: '입찰 진행', tone: 'info' },
	completed: { text: '경매 완료', tone: 'success' },
	cancelled: { text: '경매 취소', tone: 'error' }
};

export const LOT_STATUS: Record<LotStatus, StatusMeta> = {
	open: { text: '입찰 중', tone: 'info' },
	sold: { text: '낙찰', tone: 'success' },
	unsold: { text: '유찰', tone: 'warning' },
	cancelled: { text: '취소', tone: 'error' }
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
