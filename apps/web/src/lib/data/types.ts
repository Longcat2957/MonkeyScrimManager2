/*
 * 화면이 사용하는 도메인 계약.
 * DB 스키마의 enum과 1:1로 맞추고, 화면에 필요한 뷰 모델은 해당 화면을 구현할 때 이 파일에 추가한다.
 */

export type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

export type ScrimStatus =
	| 'recruit'
	| 'preparing'
	| 'ready'
	| 'in_progress'
	| 'completed'
	| 'ended_early'
	| 'cancelled';

export type FormationMethod = 'manual' | 'auction';

export type RegistrationStatus = 'pending' | 'selected' | 'standby' | 'withdrawn' | 'excluded';

export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'ended_early' | 'cancelled';

export type GameStatus = 'pending' | 'in_progress' | 'awaiting_result' | 'completed' | 'cancelled';

export type GameSide = 'blue' | 'red';

export type AuctionStatus = 'setup' | 'in_progress' | 'completed' | 'cancelled';

export type LotStatus = 'open' | 'sold' | 'unsold' | 'cancelled';
