export type RiotAccount = {
	id: string;
	gameName: string;
	tagLine: string;
	region: string;
	isPrimary: boolean;
	// 진행 중인 내전 신청에 쓰이는 계정은 연결을 해제할 수 없다.
	inActiveScrim: boolean;
};

export type PrivacySettings = {
	profilePublic: boolean;
	showRiotId: boolean;
};

export type PrivacyKey = keyof PrivacySettings;

// 조회 결과는 연결 전 확인 단계에서만 쓴다. 조회 성공이 연결 완료를 뜻하지 않는다.
export type RiotLookup = {
	puuid: string;
	gameName: string;
	tagLine: string;
	region: string;
};
