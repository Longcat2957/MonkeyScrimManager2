# 경매 후보의 실제 내전 기록 연결

기준 커밋: `249eeabd6786b9b9a56e5ec5208e0c207d087d36`. 담당: `/root/auction_profile`. 소유 소스 3파일의 구현·격리 DB 검증을 마쳤고 source를 동결했다. UI·공유 타입·라우트·전체 문서와 브라우저 검증은 root가 담당한다.

## 달라진 동작

`getAuction()`은 현재 후보가 있을 때 그 후보의 실제 내전 프로필을 준비한다. 확인 가능한 사용자와 시즌이 있고 출전 기록이 없으면 `0게임` 프로필을 제공한다. 후보가 없거나 사용자/시즌 귀속이 미확인이면 `null`을 유지한다. 조회 실패를 빈 전적으로 바꾸지 않는다.

- 경매 내전에 고정된 시즌·같은 서버·당시 사용자에 귀속된 실제 출전만 조회한다. 시즌이 교체되거나 현재 Riot 계정 소유자가 달라져도 과거 기록을 재귀속하지 않는다.
- 완료 Game·Game에 채택된 ROFL·실출전의 연결을 확인하고, 취소한 Game/Match/Scrim은 제외한다. 중도 종료에 이미 기록된 유효 Game은 유지한다.
- 승패는 실제 블루/레드 진영과 `winnerSide`를 비교한다. 현재 편성·희망 포지션·A/B 팀 슬롯으로 추정하지 않는다.
- 전체 게임·승패, 확인된 실제 포지션별 게임 수, 출전 수가 많은 주력 포지션을 제공한다. 주력 포지션의 출전 수 동률은 기존 개인 전적과 같이 정렬된 기록에서 먼저 등장한 위치를 유지한다. 무기록/위치 미확인은 `null`이다.
- 챔피언은 게임 수 내림차순·승수 내림차순·ID 오름차순의 상위 3개, 게임 목록은 최대 8개다. 누락 챔피언은 챔피언 집계에서 빼며 게임 목록에서는 `미확인`으로 보존한다.
- `playedAt:null`과 `lane:null`을 유지한다. 전체 집계에 미확인 시각이 하나라도 있으면 `recentChronologyKnown:false`를 전달해 UI가 ‘최근’과 시간 순서를 추정하지 않게 한다.
- `preferredChampions:[]`, `riot:null`을 유지한다. 내전 기록을 외부 Riot 티어·랭크·선호 챔피언으로 바꾸어 채우지 않는다.

전체 게임 수와 포지션별 확인 게임 수의 합은 다를 수 있다. 누락 챔피언이 있는 경우 실제 게임은 있어도 챔피언 집계가 비어 있을 수 있다. root에 이 의미를 전달했으며 UI가 무기록과 미확인을 구분하도록 조율했다.

## MSM1 근거와 기존 코드의 재사용

`docs/backend-plan.md`가 지정한 준용 pin은 `d60df685e48c180b236342eae81b389ae87e38bf`다. 최신 master의 Rust 재작성은 준용 기준으로 사용하지 않았다. GitHub 공식 연결의 읽기 도구로 아래 실제 Python 구현을 확인했다.

- [`repositories/auctions/tournaments.py`의 profile](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/auctions/tournaments.py#L22): 시즌별 요약·챔피언·게임·별도 Riot 캐시를 조립한다.
- [`tournament_queries.py`의 CHAMPION_RECORDS](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/auctions/tournament_queries.py#L499): 유효 시즌/출전자와 취소 부모 제외, 게임 수·승수·ID 순의 3개 챔피언.
- [같은 파일의 RECENT_GAMES](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/auctions/tournament_queries.py#L559): 유효 기록을 실제 시각/ID 순서로 최대 8개 제공한다.

MSM2에서는 기존 `server/records/queries.ts`와 같은 완료 Game·채택 ROFL·당시 귀속을 원천으로 사용한다. 기존 공개 전적의 현재 활성 시즌을 다시 선택하지 않고, 해당 경매에 고정한 시즌을 읽기 위해 같은 읽기 트랜잭션 안의 대상 한 명 조회로 구성했다. `formationPlayers()`의 실제 MMR은 그대로 사용한다. 공유 기록 조회 파일·DB schema·새 외부 endpoint는 추가하거나 수정하지 않았다.

MSM1의 사용자 설정 주력 위치와 선호 챔피언 편집, Riot 캐시는 MSM2에 실제 데이터가 없으므로 생성하지 않는다. 주력 위치는 현재 개인 전적에서 이미 사용하는 실제 출전 통계 기준을 따른다.

## 변경 파일과 주입 계약

- [auction.ts](../../../apps/web/src/lib/server/scrims/auction.ts): 기존 공개·권한·경매 상태 읽기를 유지하고 현재 후보에게만 실제 프로필을 연결한다.
- [auction-profile.ts](../../../apps/web/src/lib/server/scrims/auction-profile.ts): 대상 한 명의 읽기 전용 집계. 외부 통신·저장·MMR 변경 없음.
- [auction-profile.test.ts](../../../apps/web/tests/api/hard/db/auction-profile.test.ts): 공개 조회·집계·누락·시즌/서버·취소·귀속·동률의 실제 DB 시나리오 8개.

함수는 기존 인자를 유지한 채 여섯 번째 선택 인자 `champion: AuctionChampionResolver`를 받는다. resolver의 기본값은 `{id,name:id,iconUrl:null}`이며 root가 production loader에서 기존 Data Dragon resolver를 주입한다. 서비스 함수 자체는 외부 카탈로그를 요청하지 않는다.

## 검증 결과

- 최종 동일 source의 신규 프로필 8개 + 기존 경매 10개, **총18/18** 격리 DB 테스트 통과. 실제 서비스 함수·실제 커밋·실제 migration을 사용하며 시나리오별 전용 schema를 생성/삭제했다.
- `pnpm --filter @msm2/web check:tests` 통과.
- 소유 3파일의 Prettier 및 `git diff --check` 통과.
- 최초 테스트의 fixture 희망 위치 priority를 0으로 넣어 DB 범위 제약이 실패했다. 실제 제약에 맞게 1로 수정한 뒤 동일 시나리오를 재실행해 통과했다. 제품 결함이나 기존 오류로 집계하지 않는다.
- `pnpm exec node --env-file-if-exists=...` 호출이 pnpm 실행 파일에서 env 인자를 잘못 해석해 중단된 것은 테스트 실행 도구 문제였다. `apps/web` cwd에서 Node를 직접 실행해 최종 18개를 확인했다.

최종 명령과 source SHA는 [auction-validation.json](auction-validation.json)에 기록했다. DB 주소·세션·자격증명·테스트 전용 schema 이름은 증거에 저장하지 않았다. 위 18개는 이미 저장된 결과를 소비하는 실제 query/경매 서비스의 검증이다.

후속 [실제 전적 UI 연결 회귀](feature-browser.md)는 기존 업로드 action으로 parser 검증을 통과한 합성 ROFL2를 저장한 뒤 수동 시너지·라인 맞대결과 같은 시즌의 다른 경매 후보 상세까지 1440px Chromium에서 **1/1 통과**했다. 완료 Game·실제 챔피언·승패·미확인 시각이 UI까지 연결됨을 별도로 확인했다. backend 소유 3파일은 이 추가 검증 중 변경하지 않았다.

실기기·Safari·스크린리더·외부 Riot 조회·실서비스 OAuth/쓰기·UI 이미지 검증·전체 빌드는 이 담당자의 완료 주장에 포함하지 않는다. 해당 환경/공통 검증은 root의 별도 기록을 따른다.
