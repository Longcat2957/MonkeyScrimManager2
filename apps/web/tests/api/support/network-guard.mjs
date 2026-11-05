const nativeFetch = globalThis.fetch;

// 고정 응답을 주입하지 않은 fetch는 즉시 실패한다. HTTP hard의 로컬 앱 요청만 실제 전송한다.
globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
        process.env.MSM2_ALLOW_TEST_HTTP === '1' &&
        url.protocol === 'http:' &&
        ['127.0.0.1', '[::1]'].includes(url.hostname) &&
        !url.username &&
        !url.password
    ) {
        return nativeFetch(input, init);
    }
    throw new Error('테스트에서 허용되지 않은 네트워크 fetch입니다. 고정 응답을 주입해 주세요.');
};
