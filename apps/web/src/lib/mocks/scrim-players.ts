// 모집 명단과 서버 관리에서 같은 사람을 같은 사용자 ID로 찾는다.
export const mockScrimPlayers = [
    '홍길동',
    '김철수',
    '박영희',
    '이몽룡',
    '성춘향',
    '장보고',
    '강감찬',
    '유관순',
    '안중근',
    '정약용',
    '세종',
    '이순신',
    '최무선',
    '허준',
    '김유신',
    '을지문덕',
    '신사임당',
    '황진이',
    '계백',
    '온달'
].map((displayName, index) => ({
    // 마지막 사용자 연결이 사라진 과거 기록을 재현한다.
    userId: index === 12 ? null : `devPlayer${String(index + 1).padStart(3, '0')}`,
    displayName
}));
