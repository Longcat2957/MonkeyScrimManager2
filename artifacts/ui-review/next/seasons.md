# 과거 시즌 열람: 구현과 검증

- 기준 커밋: `a98210a443f41819d33ac749c48701616c67fd8d`.
- 대상: 서버 홈의 포지션 순위, 개인 전적, 서버 통계, 기존 순위 추가 조회 GET.
- 상태: 구현·관련 회귀·최종 이미지 검토 완료. 추가 발견한 `NX-03a`도 수정 후 완료했다.
- 이 기록은 시즌 조회의 서버 구현·공통 선택 UI 연결·격리 검증과 담당자를 구분한 이미지 검토를 다룬다. 전체 프로젝트 최종 게이트는 루트의 중앙 증거를 함께 확인한다.

## 준용한 규칙

MSM1의 고정 커밋 `d60df685e48c180b236342eae81b389ae87e38bf`에서 실제 시즌 선택 구현을 확인했다.

- [통계 서비스의 시즌 선택](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/guilds/statistics.py#L47): 서버의 시즌 목록 안에서 명시한 시즌을 찾고, 생략하면 활성 시즌을 선택한다. 다른 서버의 시즌이나 없는 시즌은 404다.
- [개인 전적 검색의 시즌 선택](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/guilds/record_search.py#L47): 같은 서버의 선택 시즌을 조회하며 전체 시즌 합산으로 바꾸지 않는다.
- [통계 저장소의 시즌 정렬](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/guilds/statistics.py#L54): 활성 시즌, 시작 시각 내림차순, ID 내림차순으로 목록을 정렬한다.

## 실제 적용

| 항목 | 동작 |
| --- | --- |
| `season` 없음 | 기존 활성 시즌만 조회한다. 활성 시즌이 없으면 선택 ID는 `null`이며 전체 시즌을 합산하지 않는다. |
| `season=<uuid>` | 해당 서버의 명시한 시즌만 조회한다. 종료된 시즌도 포함한다. 대문자 UUID는 정규화한다. |
| 잘못된 UUID | 400. 빈 값, `all`, `current`도 묵시적으로 기본 시즌으로 바꾸지 않는다. |
| 다른 서버 또는 없는 UUID | 404. 다른 서버의 시즌 자료를 조회하지 않는다. |
| 빈 시즌 | `seasons`와 `selectedSeasonId`를 유지한다. 개인 전적의 미출전 포지션은 기존 초기 MMR 1500을 사용하며 게임 수는 0이다. |
| 서버 홈 | 선택 시즌은 순위에만 적용한다. 다음 내전, 진행 중 내전, 최근 경기 조회는 기존 운영 문맥을 유지한다. |
| 순위 추가 조회 | 기존 GET의 `season` 인자로 처음 선택한 시즌을 고정한다. 응답의 `RankingPage` 계약은 유지한다. |
| 개발 샘플 | 실제 과거 시즌 이력이 없어 빈 시즌 목록을 반환한다. UUID나 과거 수치를 만들지 않는다. |

기존 유효 Game·채택 ROFL·MMR 원장 조건을 유지했다. 취소 기록의 제외, 정상적으로 남긴 중도 종료 결과의 포함, 현재 활성 멤버만 순위에 포함하는 규칙을 바꾸지 않았다. 개인 과거 전적은 현재 계정 연결이나 멤버십 소멸로 다시 귀속시키지 않는다. 조회는 MMR을 복제하거나 갱신하지 않는다.

## 관련 파일

- `apps/web/src/lib/features/seasons.ts`: 공개 읽기 전용 시즌 목록과 선택 ID 형식.
- `apps/web/src/lib/server/records/seasons.ts`: 서버 범위와 UUID 검증, 활성 시즌 기본 선택, 목록 직렬화, 개발 샘플 처리.
- `apps/web/src/lib/server/records/queries.ts`: 선택 시즌의 개인·서버 기록과 MMR 조회.
- `apps/web/src/lib/server/guild/ranking-queries.ts`, `ranking.ts`: 선택 시즌의 기존 순위 조회.
- `apps/web/src/routes/g/[guildId]/+page.server.ts`, `players/[userId]/+page.server.ts`, `stats/+page.server.ts`: 빈 상태를 포함한 시즌 메타데이터 제공.
- `apps/web/src/routes/g/[guildId]/ranking/+server.ts`: 기존 순위 GET에 선택 시즌 전달.
- `apps/web/tests/api/support/http-record-seasons-fixtures.ts`: 기존 실제 업로드 action과 내부 시즌 전환 action을 재사용하는 격리 fixture.
- `apps/web/tests/api/hard/db/record-seasons.test.ts`, `api/lite/record-seasons.test.ts`, `api/hard/http/record-seasons.test.ts`, `browser/record-seasons.test.ts`: 범위별 회귀 검증.
- `docs/web/pages/records.md`, `guild.md`, `docs/web/routing.md`: 현재 구현에 맞춘 선택 시즌·DTO·URL 상태와 남은 경기 목록 필터 범위.

## 검증

| 검증 | 결과 |
| --- | --- |
| 새 시즌 DB 4개 + 기존 records/ranking 회귀 + mock/lite 5개 | 총 31개 통과. 격리 TEST DB 사용. |
| 실제 HTTP 2개 | 최신 production build에서 2/2 통과. 공개 loader와 기존 GET의 시즌 범위·오류 상태·MMR 무변경 확인. |
| 실제 브라우저 2개 | `aria`·`wrapContent`가 포함된 최신 공유 production build에서 2/2 통과. 1440 primary, 390 dark. HTTP와 브라우저 최종 합계 4/4, 13,136.906259ms. |
| 테스트 타입 검사 | `pnpm check:tests` exit 0. |
| build | 루트가 `p8HakU5c.js`의 `aria`·`wrapContent` 포함을 확인한 최신 공유 build를 사용했다. 이 담당자는 별도 build를 실행하지 않았다. |

브라우저 fixture는 정상 ROFL 세 세트를 실제 upload action으로 반영해 2:1 시리즈를 만든 뒤 실제 시즌 전환 action을 실행한다. 듀오 링크의 기존 최소 3게임 조건을 충족하며 과거 통계 행을 임의로 만들지 않는다. 순위 추가 조회 경로 검증에서는 실제 두 순위 행을 유지한 채 브라우저에 전달되는 `hasMore` 힌트만 한 번 `true`로 바꾼다. 이후 요청은 실제 기존 GET으로 `offset=2`와 과거 시즌 UUID를 보내고 실제 빈 마지막 페이지를 받는다. 이는 대량 순위 데이터를 새로 만들어 넣지 않고 소비자의 시즌 고정을 확인하기 위한 테스트 전용 경계 주입이다.

브라우저에서는 세 화면에서 현재 시즌과 과거 시즌을 오갔다. `position`·`min`·`recent`·`q` 보존, `page`·`offset` 제거, 순위·리더보드·듀오의 선수 링크에 시즌 유지, 현재의 빈 시즌에서 다시 과거 시즌 선택, Enter·Escape와 포커스 복귀를 확인했다. 두 대표 화면 크기에서 문서 가로 넘침은 없었고, 공개 방문자의 POST와 JS·예상 밖 콘솔 오류는 각각 0건이었다. 격리 fixture와 브라우저는 실행 종료 후 정리됐다.

루트의 전체 DB 검증에서 새 시즌 fixture 1건이 호스트와 DB의 1ms 시계 차이로 `mmr_seasons_time_order` 제약을 위반했다. 제품 오류가 아니라 테스트에서 Node의 `new Date()`를 종료 시각으로 쓰던 가정이었다. 해당 DB·HTTP 테스트의 종료값 3곳만 DB의 `greatest(now(), mmr_seasons.started_at)`로 바꿨고 제품 소스나 DB 제약은 변경하지 않았다. 이후 기존 records/ranking을 포함한 DB/lite 31개와 실제 HTTP 2개를 다시 실행해 33/33 통과했다(8,826.393865ms, `/tmp/msm2-history-season-clock-regression.log`). 전체 DB 최종 재게이트는 루트 담당자 범위다.

## 검증 범위와 제한

- 최신 공유 build의 MCP 최종 33장을 직접 읽은 담당자와 SHA256은 `seasons.json`에 기록했다. 1440px 12장은 `auction_profile`, 390px 15장과 추가 폭 6장은 `root`다.
- 외부 서비스 또는 실제 운영 DB에 쓰지 않았다. 세션·비밀 환경값은 출력하거나 증거에 남기지 않았다.
- 새로운 공개 API나 전체 시즌 합산 정책은 추가하지 않았다.
- 전체 check/build/회귀 게이트는 각 담당자의 source freeze 후 루트 담당자가 최종 실행한다.

## 데스크톱 이미지 독립 검토

`auction_profile` 담당자가 Impeccable의 critique·audit 확인 항목을 기준으로 아래 1440px 전체 이미지 12장을 `view_image`로 직접 읽고, `aria`·`wrapContent` 반영 후 최종 재촬영 12장도 다시 읽었다. 현재의 빈 시즌과 과거의 실제 3게임 시즌을 두 테마에서 비교했다. 페이지 위계, 장문 시즌 이름, 선택한 시즌의 위치와 빈 상태에서 다시 선택할 수 있는 흐름을 확인했다. 개인 전적의 지표·MMR·챔피언·기록·듀오 순서는 유지됐고, 서버 홈의 운영 정보와 선택 시즌 순위도 분리되어 있었다. 이 검토에서 새 UI 수정이 필요한 문제는 확인하지 못했다.

| 화면·테마 | 현재 빈 시즌 | 과거 실제 기록 |
| --- | --- | --- |
| 홈·primary | [이미지](after/seasons/home-primary-1440-current-empty.png) | [이미지](after/seasons/home-primary-1440-past-records.png) |
| 홈·dark | [이미지](after/seasons/home-dark-1440-current-empty.png) | [이미지](after/seasons/home-dark-1440-past-records.png) |
| 개인 전적·primary | [이미지](after/seasons/player-primary-1440-current-empty.png) | [이미지](after/seasons/player-primary-1440-past-records.png) |
| 개인 전적·dark | [이미지](after/seasons/player-dark-1440-current-empty.png) | [이미지](after/seasons/player-dark-1440-past-records.png) |
| 통계·primary | [이미지](after/seasons/stats-primary-1440-current-empty.png) | [이미지](after/seasons/stats-primary-1440-past-records.png) |
| 통계·dark | [이미지](after/seasons/stats-dark-1440-current-empty.png) | [이미지](after/seasons/stats-dark-1440-past-records.png) |

이미지 표시 도구가 앞선 이미지와 동일한 영역을 생략해 홈 히어로 2장과 통계 제목 2장이 빈 것처럼 보였다. 실제 PNG의 픽셀과 영역 해시를 대조해 촬영 결함이 아님을 확인했으며 재촬영 요청을 철회했다. 홈 히어로 좌표 `(120,202)-(510,470)`는 4장 모두 영역 SHA256이 동일하고 밝은 글자 픽셀이 각 8,072개였다. 통계 제목 좌표 `(89,112)-(180,170)`도 같은 테마의 현재·과거 이미지 해시가 같았고, primary에는 어두운 글자 픽셀 345개, dark에는 밝은 글자 픽셀 353개가 있었다. 최종 이미지 해시와 직접 읽은 담당자는 `seasons.json`에 기록했다. 실제 PNG 12장에서 새 시각 결함은 확인하지 못했다.

외부 origin을 막은 격리 브라우저여서 일부 챔피언 이미지가 로드되지 않았다. 실제 통계·챔피언 이름은 유지되며 CDN의 정상 이미지 품질이나 네트워크 성능을 검증했다는 의미는 아니다.

## `NX-03a` — 긴 시즌 옵션 잘림: 수정 후 완료

루트 담당자는 최초 모바일 15장을 직접 읽고 390px의 `ActionSheet` 옵션에서 긴 시즌 이름이 잘리는 P2 문제 1건을 확인했다. 같은 이름이 페이지의 선택 버튼에서는 정상 줄바꿈되어 문서 가로 넘침 검사만으로는 발견되지 않는 문제였다. 루트 담당자가 공통 `ActionMenu`의 opt-in `wrapContent`로 수정했으며, 기존 다른 메뉴의 표현은 유지한다. 수정 전 메뉴는 [홈](before/home-dark-390-season-menu.png)·[개인 전적](before/player-dark-390-season-menu.png)·[통계](before/stats-dark-390-season-menu.png)에 보존했다.

유지 브라우저 테스트에도 긴 시즌 옵션의 실제 텍스트 `Range`가 버튼 경계를 벗어나지 않는지 검증을 추가했다. 수정 전 build에서는 1440px이 통과하고 390px이 이 조건으로 실패해 문제를 재현했다(1/2 통과, 로그 `/tmp/msm2-history-season-menu-before.log`). 수정 후 최신 공유 build에서 HTTP 2개와 브라우저 2개를 다시 실행해 4/4 통과했다(`/tmp/msm2-history-season-http-browser-final.log`). 새 버튼의 실제 `aria-haspopup="dialog"`와 닫힘 `aria-expanded="false"` → 열림 `true` → Escape 뒤 `false`도 두 폭의 세 화면에서 확인했다.

루트 담당자가 최종 재촬영한 모바일 15장과 추가 통계 6장을 모두 직접 읽었다. 긴 선택 이름·메뉴 옵션 줄바꿈, 선택 시즌 문맥, `position`·`min`·`recent` 보존, 빈 시즌에서의 이동, 전체 레이아웃, 단일 조작과 메뉴 포커스 링이 정상이었으며 남은 시각 결함은 확인하지 못했다. 최종 390px 메뉴는 [홈](after/seasons/home-dark-390-season-menu.png)·[개인 전적](after/seasons/player-dark-390-season-menu.png)·[통계](after/seasons/stats-dark-390-season-menu.png)에서 확인한다.

| 추가 확인 조건 | 기본 화면 | 시즌 메뉴 |
| --- | --- | --- |
| 320px dark | [이미지](after/seasons/stats-dark-320-current-empty.png) | [이미지](after/seasons/stats-dark-320-season-menu.png) |
| 768px primary | [이미지](after/seasons/stats-primary-768-current-empty.png) | [이미지](after/seasons/stats-primary-768-season-menu.png) |
| 1024px dark | [이미지](after/seasons/stats-dark-1024-current-empty.png) | [이미지](after/seasons/stats-dark-1024-season-menu.png) |

최종 33장(기본·메뉴 27장 + 추가 폭 6장)의 실제 URL·뷰포트·테마·해시·읽은 담당자를 `seasons.json`에 합쳤다. 모든 격리 fixture와 브라우저가 종료됐고, 더 사용하지 않는 mode 0600 임시 MCP bootstrap도 삭제했다. 이 기능 범위에서 남은 확인 문제는 없다.
