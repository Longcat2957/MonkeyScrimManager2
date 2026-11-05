/** 서버가 인증한 실행자다. 길드 권한과 표시용 프로필은 포함하지 않는다. */
export type Actor = {
    readonly userId: string;
    readonly isServiceAdmin: boolean;
};

/** 서버 내부에서만 쓰는 세션 식별자다. 페이지 데이터로 내려보내지 않는다. */
export type AuthSession = {
    readonly tokenHash: string;
    readonly expiresAt: Date;
};
