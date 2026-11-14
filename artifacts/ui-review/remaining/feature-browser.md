# 실제 전적의 편성·경매 UI 연결 회귀

2026-11-14에 root의 최종 production build를 사용해 격리 앱과 테스트 DB에서 **1/1 통과**했다. 이 실행에서는 build를 다시 돌리지 않았다. [검증 값과 테스트 source SHA](feature-browser.json)를 함께 기록했다.

대상은 [formation-records.test.ts](../../../apps/web/tests/browser/formation-records.test.ts) 한 파일이며, 기존 `createHttpMatchResultFixture`와 기존 업로드·경매 action을 재사용한다. 새 제품 API나 테스트 전용 제품 endpoint를 추가하지 않았다. 정식 `pnpm --filter @msm2/web test:browser`에 자동 포함된다. 이번 단일 실행은 프로젝트 runner와 동일하게 실제 앱 DB 주소·API 키를 지운 임시 runner에서 기존 build를 사용했다.

## 실제로 확인한 연결

1. 출전자 세션으로 정상 구조의 합성 ROFL2를 기존 `upload` action에 전송했다. 실제 parser·참가자 연결·DB 저장을 거쳐 완료 Game 1개가 생겼고, 알 수 없는 절대 시각은 `null`이었다.
2. 동일 수동 내전의 상세를 실제 브라우저에서 열었다. 1팀 시너지 3개가 각각 `1승 0패`, 2팀 시너지 3개가 각각 `0승 1패`이며 각 기록의 게임 수·승률도 일치했다. 다섯 포지션의 맞대결은 모두 1팀 기준 `1-0`·`1승 우위`였다.
3. 테스트 내부에서 같은 서버·고정 시즌·기존 사용자/계정의 새 경매 모집만 준비했다. 기존 `setup`·`start`·`draw` action으로 후보를 뽑고 경매 화면에서 상세보기를 열었다.
4. 후보는 과거 기록의 `1게임`·승패·실제 저장 챔피언을 표시했다. 절대 시각이 없으므로 `최근 게임` 대신 `게임 기록`과 `시각 미확인`을 표시했다. 데이터가 없는 선호 챔피언·Riot 전적은 생성하지 않았다.

1440×1000 Chromium에서 두 화면의 문서 가로 넘침이 없었고 앱 JavaScript·예기치 않은 console 오류는 0개였다. 테스트 종료 시 브라우저·격리 앱·전용 DB schema 정리까지 완료했다. `pnpm check:tests`와 해당 파일 Prettier 검사도 통과했다.

## 검증의 한계

이 테스트는 기능 연결 회귀이며 별도의 스크린샷을 촬영하지 않았다. 이미지 비교와 모바일 검토는 root의 전체 검증 기록을 따른다. 실제 사용자에게서 새로 수집한 ROFL·실서비스 Discord/Riot/OAuth·실서비스 쓰기를 검증했다고 주장하지 않는다. 고정 Data Dragon 카탈로그가 비어 있어 챔피언 이름은 문서화된 ID fallback으로 확인했다. Safari·실기기·스크린리더는 이 실행의 대상이 아니다.
