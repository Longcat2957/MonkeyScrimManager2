# 진행 중 내전 전체 취소

## 확인한 규칙과 적용 범위

MSM1 pin [`d60df685e48c180b236342eae81b389ae87e38bf`](https://github.com/Longcat2957/MonkeyScrimManager/tree/d60df685e48c180b236342eae81b389ae87e38bf)의 실제 Python 서비스·SQL·통합 테스트를 읽었다.

- [`auctions/cancellation.py:53`](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/auctions/cancellation.py#L53): `BIDDING`·`BRACKET_SETUP`·`IN_GAME`만 취소한다. 최신 확정 결과부터 역분개하며 안전하지 않은 MMR 이력을 만나면 전체 작업이 실패한다. 원본 모집도 취소한다.
- [`cancellation_commands.py:46`](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/auctions/cancellation_commands.py#L46): 현재 Match들을 취소하고 승자와 라인업 확정을 해제한다. 라인업 행을 삭제하지 않는다.
- [`test_cancellation.py:292`](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/tests/integration/auctions/test_cancellation.py#L292): 두 결과의 20개 역분개 원장·10개 라인업 보존을 검증한다. 363행의 동일 점수 체크포인트 사례는 최신 결과 역분개가 먼저 실행됐어도 앞선 결과가 막히면 전체를 롤백한다.
- [`recruitments.py:349`](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/auctions/recruitments.py#L349): 취소된 모집을 복구하면 마감 시각이 있는 모집은 `CLOSED`로 돌아간다. 취소한 tournament·결과·MMR을 되살리는 동작이 아니다.

MSM2는 모집과 운영을 하나의 Scrim으로 표현한다. 이번 승인 범위는 기존 미시작 취소·원래 단계 복구를 유지하면서 `in_progress`의 전체 취소를 추가하고, 이 취소의 복구를 `preparing`으로 해석하는 것이다. 완료·중도 종료 내전까지 넓히지 않는다. 수동 배정은 유지한다. 경매는 팀장·시작 포인트를 유지하되 기존 영입을 무효화하고 `setup`부터 다시 진행한다. 이 통합 모델 대응을 MSM1의 별도 tournament 재개라고 취급하지 않는다.

## 실제 변경

- `apps/web/src/lib/server/scrims/cancellation.ts`: 하나의 트랜잭션 안에서 현재 Match·Game·MMR 근거를 확인한다. 고정 시즌 → 내전 → 후속 대진 Match → Game → 점수 순서로 잠그고, 후속 대진·같은 경기의 뒷세트·같은 점수의 나중 원장부터 역분개한다. 타 내전의 유효 후속 결과와 동일 점수 관리 보정도 넘지 않는다. 어느 단계든 실패하면 역분개·배치·대진 분리·게시 예약을 모두 롤백한다.
- `0008_scrim_result_cancellation.sql`·schema: `scrim_cancellations`에 운영 문맥·이전 대진·라인업·경매 기본 설정과 결과 수량을 남긴다. `Match.cancellationBatchId`는 같은 Scrim의 취소 배치만 참조하고 취소 Match에만 설정한다. 미복구 배치는 내전당 하나다. 업무 테이블은 42개, FK는 96개이며 배포 probe용 FK는 포함하지 않는다.
- 기존 Match·라인업·Game·ROFL 선별 자료·채택 영수증·출전·MMR 원장은 삭제하지 않는다. 현재 대진은 배치 snapshot에 보존한 뒤 분리한다. 이 FK 근거가 있는 과거 Match만 현재 편성의 Game 유무 검사에서 제외하므로 새 대진과 Match를 만들 수 있다. 근거 없는 과거 취소를 추정하여 제외하지 않는다.
- `service.ts`·`workflow.ts`: 기존 `cancel`·`restore` action이 새 경로를 소비한다. 새 외부 API는 없다. 관리자만 `cancelGameCount`·`cancelledGameCount`를 받고 공개·비관리자 조회는 `null`이다. 복구 안내는 편성 준비 복귀와 결과·MMR 미재적용을 명시한다. 편성 방식이나 경매 취소 근거가 달라지면 복구를 막는다.
- `bracket.ts`: 원본 이력은 남기고 현재 대진만 초기화·다시 시작할 수 있도록 검사와 미시작 Match 삭제 범위를 좁혔다.
- `mocks/{scrims,workflow,bracket,teams,matches}.ts`: 같은 취소/복구 단계와 수량 계약을 적용했다. 이전 결과는 내부 보관하고 현재 점수·게임 목록에서 제외한다. 재편성 뒤 고정 샘플 결과를 다시 넣지 않는다.

## 검증

검증은 `.env.test`의 격리 DB 스키마와 가짜 Discord·Riot 상류 API로 진행했다. 실제 서비스에 쓰지 않았으며 비밀값·쿠키·세션 ID는 증거에 기록하지 않았다.

- 최종 소스의 새 DB 테스트 14개 통과: 실제 ROFL 취소·역분개·이력 보존·복구·새 Match 결과 등록, 두 번의 전체 취소 배치, 4팀 5세트의 후속 대진 역순 처리, 경매 재시작, 0결과, 외부 내전·관리 보정 장벽, 부분 역분개 전체 롤백, 권한·서버·revision·동시 요청, 게시 실패, 채택 영수증 누락, 취소 뒤 경매 상태 불일치, 기존 세트 정정 이력, 완료·중도 종료 제외, 0008 업그레이드·CHECK·FK.
- 기존 취소·중도 종료·대진·결과·MMR과 합친 84개가 통과했다. 마지막 경매 상태 손상 시 복구 차단 1개를 추가하기 직전의 전체 실행이며, 추가 뒤 새 14개를 다시 실행했다.
- 개발 목의 기존/진행 취소와 중도 종료 테스트 10개 통과.
- `pnpm exec tsc --noEmit -p apps/web/tests/tsconfig.json` 통과. 수정 파일은 Prettier로 정리했다.
- 최신 shared production build에서 HTTP action 테스트 2개가 통과했다. 실제 ROFL 등록 → 권한/서버/revision 검사 → 전체 취소/10개 역분개 → 편성 준비 복구와 원본 보존, 보정 원장 이후 409/전체 무변경을 확인했다. 독자 재빌드는 하지 않았다. Root가 전체 검사와 브라우저 검증을 합성한다.

정확한 파일 SHA-256과 실행 범위는 [cancellation.json](cancellation.json)에 기록했다. 최종 build 검증 전에 독자 build를 하지 않는다.

## 남겨 둔 범위

완료·중도 종료 내전의 전체 취소, 타 내전·관리 보정 이후 원장까지 변경하는 역분개, 취소한 Game·MMR의 재적용은 이번 구현에 포함하지 않는다. 복귀 근거 없는 과거 취소는 기존대로 차단한다. 시즌 운영·배포·실시간 경매 전송 정책을 이 작업에서 바꾸지 않았다.


## 수정 전 확인창의 독립 이미지 판독

`formation_records`가 Root MCP 촬영 원본 `before/wide-*-confirm.png` **8장 모두**를 `view_image`로 직접 읽었다. 1440px·390px, primary·dark, 전체 취소 확인·취소 복구 확인의 조합이다. 각 원본의 SHA-256·PNG 크기·담당·관찰은 `cancellation.json`의 `수정전시각검토`에 기록했다. 전체 페이지 PNG의 높이는 뷰포트 높이와 구분한다.

**NX-01a / P2 / 직접 확인 / layout·typeset·adapt·polish:** 1440px 양 테마의 두 확인창은 좌우에 작은 여백만 남기는 폭으로 펼쳐진다. 취소 결과와 복구 의미를 설명하는 긴 문구가 한 줄로 길어지고 두 버튼도 화면 절반 가까이 늘어나, 짧은 의사결정에 필요한 읽기 범위가 과도해진다. 390px에서는 문구와 두 버튼이 화면 안에 들어가고 명백한 잘림은 없지만, 긴 본문의 중앙 정렬이 여러 줄의 읽기 시작점을 흩뜨린다. Root가 적용한 최대 36rem·85dvh와 본문 왼쪽 정렬은 이 공통 원인에 대응한다. 최종 after를 읽기 전에는 시각 수정 완료로 확정하지 않는다.

유지할 부분은 전체 취소와 복구를 구분하는 제목, 결과 수량·MMR 역분개·결과 미재개를 설명하는 문구, 취소/확인의 한 쌍, 복구 확인에서 보이는 취소 버튼의 포커스 링이다. 모바일 네 장에서도 이 문구와 두 버튼이 함께 보인다.

정적 판독에서는 키보드·스크린리더·스크롤 잠금·성능·정량 대비를 새로 측정하지 않았다. fullPage PNG에서 fixed dim 배경이 뷰포트 높이 경계 아래에 이어지지 않는 부분은 촬영 특성으로 구분하며 UI 결함으로 세지 않는다. 격리 fixture에서 차단한 외부 이미지·폰트의 로딩 품질도 이 증거로 판단하지 않는다. Root의 MCP 기능 검증과 Node browser 검증은 별도 근거다. 소스·원본 이미지 수정과 새 촬영은 하지 않았다.


## 최종 통합 검사의 fixture 순서 의존 수정

Root의 전체 DB 검사에서 기존 `scrim-early-end.test.ts`의 결승 준비 사례 하나가 실패했다. `createMatchResultFixture`의 `f.matches`는 `ORDER BY` 없는 조회 결과인데 테스트가 그 배열 순서를 `f.players(true, index * 10)`의 계정 구간과 같다고 가정했다. 준결승2가 먼저 오면 준결승1의 ROFL 계정을 준결승2에 제출하므로 기존 출전자 연결 guard가 `results.ts:305`에서 정상적으로 거절한다.

무작위 재시도 대신 준결승2 → 준결승1 순서를 의도적으로 고정하여 수정 전 동일 `CONFLICT`를 재현했다(`/tmp/msm2-next-early-end-order-before.log`, 1개 결정적 실패). 테스트 안에서 실제 Match의 `teamAId`·`teamBId`에 맞는 fixture 계정을 고르도록 고쳤고 결승도 같은 매핑을 사용한다. 강제 역순은 회귀 조건으로 남겼다. 제품 규칙·서버 소스·공유 fixture는 바꾸지 않았다.

수정 뒤 중도 종료 11개와 전체 취소·마이그레이션 14개가 같은 실행에서 **25/25 통과**했으며 tests TypeScript 검사도 통과했다. 로그는 `/tmp/msm2-next-early-end-order-after.log`다. 테스트 개수는 바꾸지 않았고 전체 DB의 최종 재실행은 Root가 확정한다.


## 최신 MCP 데스크톱 12장 판독

`formation_records`가 `after/cancellation-mcp/1440-*.png` **12장 전부**를 `view_image`로 직접 읽었다. 최신 Root MCP의 1440×1000, primary·dark, `before-cancel`·`cancel-confirm`·`cancelled`·`restore-confirm`·`restored-preparing`·`restored-manual` 조합이다. 원본별 SHA-256·`imageRead: true`·`reviewer: formation_records`·실제 URL·PNG 크기·관찰은 `cancellation.json`의 `수정후데스크톱시각검토`에 기록했다. 390px 최신 12장은 Root의 별도 판독 범위다.

NX-01a의 데스크톱 문제는 해결됐다. 취소·복구 확인창은 중앙의 최대 36rem 폭으로 정리됐고 긴 본문은 왼쪽 정렬됐다. 취소 확인은 결과 수량·MMR 역분개·기록 보존·복구 의미를 여러 줄로 읽을 수 있으며, 복구 확인은 편성 준비 복귀와 결과/MMR 미재적용을 구분한다. 취소/확인 버튼은 본문 아래에 함께 있고, 복구의 취소 버튼 포커스 링도 두 테마에서 보인다. `captures.json`의 데스크톱 12건은 모두 가로 넘침 없음·JS 오류 없음이며, 확인 본문 폭 ≤600px 자동 검증 통과는 Root의 별도 측정 근거로 구분한다.

| 상태 | 두 테마의 직접 관찰 |
| --- | --- |
| 진행 중 기본 | 제목·진행 중 태그·4 진행 단계가 일치한다. 운영 메뉴와 비활성 내전 종료, 참가자 목록의 위계를 유지한다. |
| 전체 취소 확인 | 제한된 폭과 왼쪽 정렬로 결과와 복구 의미를 읽을 수 있고 두 행동이 함께 보인다. |
| 취소 후 | 취소 태그를 표시하고 진행 단계와 내전 종료 버튼은 남지 않는다. 참가자 10명과 운영 메뉴를 유지한다. |
| 복구 확인 | 편성 준비 복귀·참가자 유지·결과/MMR 미재적용 안내가 한 곳에 있다. |
| 편성 준비 복귀 | 편성 중 태그·2 편성 단계·팀 편성 확정 안내가 일치한다. 참가자와 기존 방식 선택을 유지한다. |
| 수동 편성 복귀 | 10/10 배치·미배정 0명·두 팀 각 5명을 유지한다. 상세·방식 변경·초기화·확정은 하나의 도구줄에 있고 각 자리 배정/해제 조작도 유지한다. |

이 12장에서 추가 수정이 필요한 시각 결함이나 같은 대상의 조작 중복은 확인하지 못했다. 수정 전후는 같은 서비스 경로·역할·상태·뷰포트 의미를 비교했으며, 격리 fixture의 UUID·참가자 정렬이 달라 픽셀 동일성 검사의 golden으로 취급하지 않는다. fullPage/fixed dim 경계·차단된 외부 폰트/이미지·정적 이미지로 확인할 수 없는 키보드/스크린리더/실제 스크롤 잠금·성능·정량 대비의 한계는 앞선 기록과 같다. 소스·PNG·촬영 metadata를 바꾸거나 새로 촬영하지 않았다.


## 모바일 근거 병합과 NX-01a 완료

Root가 최신 `after/cancellation-mcp/390-*.png` **12장 모두**를 직접 읽었다. 결과 1개·MMR 취소·이력 보존과 복구 후 결과 미재개 안내, 확인창 읽기 폭·본문 정렬·두 버튼 노출, 취소 → 편성 준비 상태 전환, 기존 10명 배정과 MMR 1500 복원이 명확하며 추가 시각 결함을 확인하지 못했다. 각 PNG의 SHA-256은 이 담당자가 계산하고 `imageRead: true`·`reviewer: root`와 함께 `cancellation.json`의 `수정후모바일시각검토`에 합쳤다. Root의 판독을 이 담당자의 직접 판독으로 세지 않는다.

**NX-01a는 완료다.** 최신 데스크톱 12장은 `formation_records`, 모바일 12장은 Root가 읽어 1440×1000·390×844, 양 테마·6상태의 **최신 24장**을 확인했다. 원본 `captures.json`의 모든 조건은 가로 넘침 없음·JS 오류 없음이며 확인 본문 폭 제한 자동 검증도 Root가 통과 확인했다. 소스·PNG·촬영 metadata 수정과 새 촬영은 하지 않았다.

Root가 격리 fixture 4개를 모두 종료했다고 확인했다. 재사용하지 않는 `/tmp/msm2-full-cancel-bootstrap.mjs`와 privateJSON 잔여 파일은 정리한다. 실제 물리 모바일 기기·음성 스크린리더·정량 대비·격리 환경에서 차단한 외부 이미지/폰트 품질을 이번 이미지 판독으로 검증했다고 주장하지 않는다.
