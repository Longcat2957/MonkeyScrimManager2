# ROFL 분석

로컬 ROFL2 파일의 종료 메타데이터, 청크 컨테이너와 패킷 경계를 자체 파서로 읽는다.
Riot 계정 조회와 독립되어 있으며, Linux에서 Node.js 기본 모듈만으로 실행한다.
외부 ROFL 라이브러리·API·게임 실행파일은 사용하지 않는다.
패킷 본문은 의미가 확인되지 않은 상태로도 원본 바이트를 보존한다.

## 로컬 확인

프로젝트 루트에서 실행한다. 입력 파일은 읽기만 하고 결과 JSON은 표준 출력으로 보낸다.

```sh
pnpm --silent rofl:inspect /path/to/replay.rofl
```

로컬 테스트 원본과 분석 결과는 Git에서 제외되는 프로젝트 루트의 `samples/`에 둔다.
결과를 파일로 남기려면 새 출력 경로를 지정한다.

```sh
pnpm --silent rofl:inspect samples/replay.rofl > samples/replay-analysis.json
```

`rofl:inspect` 출력은 컨테이너 버전, 게임 버전, 경기 시간(밀리초), 참가자별 요약과 원본 메타데이터를 포함한다.
`metadata`에는 원래의 `statsJson` 문자열과 알 수 없는 필드도 그대로 남긴다.
현재 이 명령은 업로드 원본 보관이나 경기 등록을 수행하지 않으며 분석 결과에는 참가자 식별 정보가 포함된다.

| 요약 필드 | ROFL 출처 |
| --- | --- |
| `gameVersion` | ROFL2 헤더의 버전 문자열 |
| `gameLengthMs` | 메타데이터 `gameLength` |
| `riotId` | `RIOT_ID_GAME_NAME`, `RIOT_ID_TAG_LINE` |
| `replayPuuid` | 메타데이터의 원시 `PUUID` |
| `champion` | `SKIN` |
| `teamId` | `TEAM` |
| `win` | `WIN`: `Win`은 true, `Fail`은 false |
| `kills`, `deaths`, `assists` | `CHAMPIONS_KILLED`, `NUM_DEATHS`, `ASSISTS` |
| `minionsKilled`, `neutralMinionsKilled` | `MINIONS_KILLED`, `NEUTRAL_MINIONS_KILLED` |
| `creepScore` | 위 두 CS 필드의 합계 |

참가자 수·배열 순서로 팀이나 포지션을 추정하지 않는다. 누락된 요약 필드는 `null`이며 실제 `0`과 구분한다.
CS는 두 구성 값이 모두 있을 때만 계산한다. 인식하지 못한 승패 문자열도 `null`로 두고 원본은 보존한다.
ROFL의 원시 PUUID를 Riot API의 계정 식별자와 같다고 가정하지 않으며, 파일명이나 미확정 헤더 바이트에서 경기 ID를 만들어내지 않는다.

## 본문 전체 추출

상세 연구용 명령은 **새 출력 디렉터리**를 받는다. 부모 디렉터리는 미리 존재해야 하며,
기존 디렉터리가 있으면 덮어쓰지 않고 종료한다.

```sh
pnpm --silent rofl:research samples/replay.rofl samples/replay-research
```

| 출력 | 내용 |
| --- | --- |
| `original.rofl` | 입력 파일의 바이트 그대로 복사한 원본 |
| `metadata.raw.json` | 종료 메타데이터의 원문 바이트. 숫자 표기·정밀도·공백까지 유지 |
| `metadata.json` | 원본 메타데이터와 `statsJson`을 펼친 `playerStats` 배열 |
| `chunks.json` | 청크별 원본 위치·길이·ID·스트림·추가 바이트, 해제본 SHA-256, 성공·실패 정보 |
| `chunks/*.bin` | 압축 해제한 청크 전체. 패킷 헤더와 미해석 본문 포함 |
| `packets.ndjson.gz` | 패킷별 청크 번호·오프셋·길이·플래그·시간·ID·param·본문 위치 |
| `packet-types.json` | 스트림과 패킷 ID별 개수·본문 길이 분포·플래그·시간 범위·서로 다른 param 수 |
| `report.json` | 입력 해시·게임 버전·추출 범위·누락 바이트·오류·출력 스키마 버전 |

`playerStats`는 알려진 필드만 선택하지 않는다. 숫자로 보이는 문자열도 변환하지 않아
태그의 선행 0과 미확인 문자열 필드를 유지한다. 다만 `metadata.json`은 JS `JSON.parse`로 읽은 뷰이므로
실제 JSON 숫자는 JS 정밀도와 직렬화의 영향을 받는다. 예를 들어 큰 정수가 반올림되거나
무한대 범위의 숫자가 `null`로 직렬화될 수 있다. 숫자까지 정확한 원문은 `metadata.raw.json`을 기준으로 한다.
이 파일들에는 참가자 식별 정보가 포함된다.

패킷 인덱스의 `chunk`는 `chunks.json`의 배열 인덱스다. `offset`과 `payloadOffset`은
해당 청크의 `decodedFile` 시작을 기준으로 한다. 본문은 그 파일의
`[payloadOffset, payloadOffset + payloadLength)` 범위를 읽으면 된다.
파일에 있던 청크 ID는 별도 필드이며, 스트림이 다르면 같은 ID가 나올 수 있다.

시간은 초 단위이며 float32 절대값과 밀리초 증분을 JS 배정밀도로 누적한다.
`param` 증분은 부호 있는 int8을 더한 뒤 uint32로 순환한다.
`param`을 플레이어 ID로, 패킷 개수를 실제 경기 이벤트 수로 간주하지 않는다.
정밀도나 의미 해석을 수정할 때도 원본 패킷 헤더를 다시 읽을 수 있다.

통계용 Map·Set은 총 250,000개 항목으로 제한한다. 초과하면 `report.json`의
`statistics.truncated`가 `true`가 되고 새 통계 키의 추가만 중단한다.
그 경우 종류 목록·길이 분포가 일부 생략되고 서로 다른 값의 개수는 하한값이 된다.
전체 패킷 수·바이트 수와 원본·청크·패킷 인덱스 추출은 계속된다.

종료 코드는 전체 구조 추출 성공 `0`, 일부 메타데이터·청크·패킷 분석 실패 `2`,
입력·컨테이너·출력 오류 `1`이다. 패킷 분석이 중단된 청크도 해제본을 보존하며,
다음 청크를 계속 처리한다. 실패 위치를 건너뛰며 패킷을 억지로 복구하지 않는다.
`report.json`은 모든 출력이 끝난 뒤 생성한다. 이 파일이 없으면 추출 작업이 완료되지 않은 것이다.
`status: complete`는 지원하는 구조를 모두 읽었다는 뜻이며 패킷 의미 해석이나 파일 진위 확인을 뜻하지 않는다.

## 코드 구조

| 모듈 | 책임 |
| --- | --- |
| `format.ts` | 공통 오류·파일 한도, ROFL2 헤더와 종료 영역 위치 검증 |
| `parser.ts` | `readRoflMetadata`의 전체 JSON 필드, `parseRoflMetadata`의 검증된 경기 요약 |
| `container.ts` | 17·18바이트 청크 헤더 판별, 청크 경계·크기 검사, 기본 Zstd 압축 해제 |
| `packets.ts` | 청크별 상태를 초기화하는 패킷 경계 순회. 본문은 복사·해석하지 않음 |

위 모듈은 `apps/web/src/lib/server/rofl/`에 있다. 두 로컬 CLI는 같은 모듈을 사용한다.

## 지원 형식과 검증

현재 **ROFL2만 지원**한다. `RIOT` magic과 컨테이너 버전 2, offset 14의 버전 길이,
offset 15부터의 게임 버전 문자열을 읽는다. 파일 마지막 4바이트의 little-endian 길이로 메타데이터 범위를 찾고,
그 앞의 256바이트 서명 영역이 헤더와 겹치지 않는지 검사한다. 원본 메타데이터 읽기는
UTF-8, JSON, `statsJson` 참가자 배열을 검증하고, 요약 함수가 추가로 경기 시간과 요약 필드를 검증한다.

파일 제한은 128 MiB, 메타데이터 제한은 2 MiB다. 청크는 최대 65,536개,
압축 해제 크기는 청크당 16 MiB·전체 512 MiB로 제한하고 Zstd 윈도도 16 MiB로 제한한다.
본문을 파일 전체 범위와 대조하고, 단일 Zstd 프레임의 마지막 블록·체크섬 영역까지 확인한 뒤
압축을 해제한다. 압축 해제 길이와 소비한 압축 바이트도 확인한다.
지원하지 않는 컨테이너 버전, 잘린 파일, 잘못된 길이·UTF-8·JSON·통계 값은 오류로 반환한다.
메타데이터가 없는 초기 ROFL2 파일도 현재 분석 대상이 아니다.

17·18바이트 후보 중 청크 영역 전체를 정확히 소비하는 하나를 선택한다.
헤더 추가 바이트·알 수 없는 스트림과 플래그를 버리지 않는다. Zstd 압축 해제 뒤에도
경계가 맞는 패킷만 기록하며 원본·청크 해시로 재분석 근거를 남긴다.

서명 진위, 참가자 권한이나 특정 내전과의 일치 여부는 검증하지 않는다.
따라서 분석 성공만으로 경기 결과를 확정해서는 안 된다.
패킷의 시각·ID·바이트 위치는 읽지만 **킬·이동·아이템 구매 등 본문의 의미 디코더는 아직 없다.**

## 검증 근거와 다음 단계

`apps/web/tests/rofl*.test.ts`는 직접 만든 합성 파일로 메타데이터, 두 청크 헤더,
Zstd 손상·크기 제한, 패킷 플래그 조합·부호 있는 증분·잘린 본문을 검사한다.
실제 파일은 [공개 16.5 ROFL2 샘플](https://github.com/Danmoreng/league-replay-analyzer/blob/955974a68adc0d08b26cca7d4e9411d6219d786c/replays/EUW1-7779216102.rofl)로 별도 확인했다.
공개 `16.5.752.7101` 파일의 98개 청크·1,674,057개 패킷과
사용자 `16.21.829.8620` 파일의 697개 청크·1,795,343개 패킷을 끝까지 읽었다.
두 파일의 10명 참가자 요약·원본 메타데이터 보존도 확인했다.
실제 파일과 참가자 데이터는 저장소에 넣지 않으며, 로컬 파일과 분석 결과는 `samples/`에 보관한다.

파일 구조와 필드 의미는 [ROFL-X의 포맷 조사](https://github.com/Toastaspiring/ROFL-X/blob/88954be66da506f188fbd134944fdfd8334ad846/docs/ROFL_FORMAT.md),
[RoflLens 컨테이너 파서](https://github.com/ss26367098/rofllens/blob/62a475a8f05e7dfa94df5990758be2156c892496/src/rofllens/container.py),
[roflxd.cs 메타데이터 모델](https://github.com/fraxiinus/roflxd.cs/blob/9921136947155ed7a162738d20e6107070813e1c/Rofl.Extract.Data/Models/Rofl2/PlayerStats2.cs)을 참고했다.
Riot이 공개한 바이너리 표준으로 간주하지 않으며 새 패치의 실제 파일로 호환성을 확인해야 한다.

구조 차이·실측 수치·미확정 사항·후속 연구 순서는 [ROFL 연구 기록](rofl-research.md)에 정리한다.
다음 연구는 보존한 패킷의 분포와 종료 통계를 비교하고, 같은 빌드의 다른 ROFL에서 의미 가설을 검증하는 것이다.
업로드 API·화면·DB 저장은 추가하지 않았다.
