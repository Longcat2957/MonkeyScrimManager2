// 봇 테스트는 주입한 Discord·내부 API 응답만 사용한다.
globalThis.fetch = async () => {
    throw new Error('봇 테스트에서 실제 네트워크 요청은 허용하지 않습니다.');
};
