# 수동 편성의 실제 전적 연결

기준 커밋 `249eeab`, 2026-11-14. 기존 화면의 `pairs: {}`를 현재 내전과 같은 시즌의 채택 ROFL 실출전 집계로 대체했다. 새 외부 API·테이블·캐시·목 수치는 추가하지 않는다. 공개 조회·관리 권한·편성 저장 및 MMR 반영 규칙은 유지한다.

## 실제 결과

- [manual.ts](../../../apps/web/src/lib/server/scrims/manual.ts)는 기존 공개 조회 트랜잭션 안에서 선택 참가자들의 실제 과거 전적을 함께 준비한다.
- [formation-records.ts](../../../apps/web/src/lib/server/scrims/formation-records.ts)는 해당 서버·내전 고정 `mmrSeasonId`의 완료 Game과 Game이 채택한 ROFL의 출전자만 읽는다. 취소한 Scrim·Match·Game과 미완료 Game은 제외하고 중도 종료의 정상 기록은 보존한다.
- 같은 팀의 두 사용자는 함께한 세트 수·승수를 집계한다. 희망 포지션이나 현재 팀 배정으로 과거 진영을 바꾸지 않는다.
- 완료 Game의 `winnerSide`는 `games_winner_requires_completion` DB CHECK로 non-null이 보장된다. 승패 불명의 완료 결과를 임의로 패배로 바꾸는 경로는 허용하지 않는다.
- 맞대결은 서로 다른 진영에서 **같은 실제 출전 포지션**으로 플레이한 경우만 집계한다. `againstByLane`으로 현재 자리의 포지션에 해당하는 기록을 제공하고, 기록 없는 포지션을 다른 포지션의 승패로 대체하지 않는다.
- 과거 귀속은 `gameParticipants → 당시 scrimParticipants.userId`를 사용한다. 현재 Riot 계정 소유자·대표 계정·멤버십·표시 이름에서 과거 사용자를 추정하지 않는다. 현재 참가자 UUID 쌍의 정렬 방향에 맞춰 승수를 변환한다.
- 시즌·사용자 연결·실제 기록이 없으면 빈 자료를 반환한다. 조회 실패는 기존 서버 오류 경로로 전달하며 빈 기록으로 숨기지 않는다. 실제 시각·미확인 포지션을 생성하거나 보충하지 않는다.
- SQL은 필요한 현재 사용자 집합만 바인딩하고 사용자 쌍·진영·승패·실출전 포지션별로 한 번에 집계한다. 참가자 쌍마다 별도 조회하지 않으며, 전체 ROFL 상세 통계나 외부 Riot 데이터를 읽지 않는다.

화면·공유 타입은 루트 작업자가 담당한다. 기존 `PairRecord.against`와 목 자료의 동작은 보존하고, 실제 기록의 포지션별 조회를 additive 필드와 선택 인수로 연결했다. 실제 `againstByLane`가 있으나 해당 포지션이 비어 있으면 맞대결 없음으로 처리하며, map 자체가 없는 기존 목 자료에만 이전 집계를 사용한다.

## MSM1 근거와 모델 대응

준용 기준은 backend-plan이 고정한 MSM1 커밋 `d60df685e48c180b236342eae81b389ae87e38bf`다. 최신 master의 Rust 재작성으로 기준을 바꾸지 않았다. GitHub 플러그인으로 다음 실제 구현을 확인했다.

- [entry_queries.py의 HEAD_TO_HEAD](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/recruitments/entry_queries.py): 모집에 고정된 시즌과 사용자 쌍·lane별 승패를 조회한다.
- [EntryHeadToHeadRail.svelte](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/web/src/lib/components/workflow/EntryHeadToHeadRail.svelte): 배정된 자리의 lane과 두 사용자 ID로 맞대결을 선택하며 좌우 사용자가 반대면 승패를 뒤집는다.
- [statistics.py의 VALID_GAMES·DUOS](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/guilds/statistics.py): 같은 시즌의 정상 확정 Game과 취소되지 않은 부모 기록, 같은 팀의 중복 없는 사용자 쌍·승패가 집계 원천이다.
- [EntrySynergyRail.svelte](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/web/src/lib/components/workflow/EntrySynergyRail.svelte)는 당시 목 시너지 자료를 받는다. 따라서 시너지의 실서버 연결이 MSM1에서 이미 완성됐다고 주장하지 않으며, 통계의 실제 동팀 DUOS 계산을 근거로 연결했다.

MSM1의 Game은 `series_id`와 `auction_match_id`로 부모 모델이 나뉘어 있고 기존 entry HEAD_TO_HEAD는 series 쪽을 조회한다. MSM2는 수동·경매 모두 같은 BO `Match`와 확정 실출전 포지션을 사용한다. `formationMethod`는 편성 수단이며 legacy Game 부모 종류와 동치가 아니다. 따라서 이를 `manual` 필터로 옮겨 경매의 정상 기록을 제외하지 않는다. [backend-plan 5.7/11.2](../../../docs/backend-plan.md)의 동일한 유효 ROFL 원천과 현재 [records/queries.ts](../../../apps/web/src/lib/server/records/queries.ts)의 취소·귀속 정책에 맞춰 두 편성 수단을 모두 집계한다.

## 검증

새 [formation-records.test.ts](../../../apps/web/tests/api/hard/db/formation-records.test.ts)의 격리 PostgreSQL 테스트 **6개 통과, 실패0·skip0**. 실제 배포 migration으로 만든 테스트 schema를 각 시나리오 종료 후 정리했다. 비밀 값·세션·DB 주소는 출력하거나 증거에 저장하지 않았다.

1. 기록·시즌·사용자 귀속이 없으면 빈 자료이며 조회로 MMR/원장을 생성하지 않는다.
2. 세 번의 실제 세트에서 동팀 승패·동포지션 맞대결을 중복 없이 집계하고, 진영 교체·현재 참가자 UUID 역순·좌우 관점 전환을 보존한다.
3. 과거 탑/미드 실출전은 별도 집계하고 null 포지션을 희망 위치로 보충하지 않는다. 동팀 집계는 실제 진영을 유지한다.
4. 취소·미완료 Game과 취소 부모는 제외하고 중도 종료의 유효 결과는 보존한다.
5. 새 활성 시즌이 생겨도 기존 내전의 고정 시즌을 바꾸지 않으며 다른 서버·다른 시즌 기록을 섞지 않는다. 편성 수단 변경도 유효 기록을 재분류하지 않는다.
6. 계정 연결·희망 포지션 변경은 과거 사용자·진영을 바꾸지 않고, 귀속이 없는 현재 참가자를 계정으로 추정하지 않는다.

단독 실행은 기존 `tests/run.mjs`와 동일하게 실제 키·앱 DB 주소를 비우고 테스트 DB만 허용한 임시 Node runner로 수행했다. 저장소 표준 재현 명령은 `pnpm --filter @msm2/web test:hard:db`다. 전체 웹 테스트 TypeScript(`pnpm exec tsc --noEmit -p apps/web/tests/tsconfig.json`)도 exit0이며 소유3파일의 Prettier 검사를 통과했다. 최종 전체 check/build·브라우저·공유 사용처는 루트 검증 기록을 따른다.

이 작업의 새 source·테스트 지문과 검사 결과는 [formation.json](formation.json)에 있다. 실제 서비스 DB 쓰기나 Discord·Riot 실연동 호출은 수행하지 않았다. 성능 개선율·전체 운영/브라우저 검증 완료를 이 단독 DB 결과로 주장하지 않는다.
