# 남은 브라우저·운영 과업 검증

2026-11-14. UI·업무 소스는 이 검증자가 변경하지 않았다. 추가 소스는 정상 ROFL 사용자 과업을 검사하는 `apps/web/tests/browser/rofl-results.test.ts` 한 파일이다. 실제 외부 계정·서비스 데이터·DM 발송을 사용하지 않는다.

## 정상 ROFL의 실제 브라우저 경로

기존 `createHttpMatchResultFixture`가 격리 PostgreSQL과 실제 SvelteKit 앱, 실제 세션 쿠키, 고정된 Discord/Riot 상류 응답을 준비한다. 모집·확정 편성·대진·경기 시작은 기존 fixture의 실제 HTTP action으로 준비하고, 이후 사용자의 파일 선택·업로드·정정은 Chromium 브라우저에서 실행한다. 제품용 테스트 endpoint나 권한 우회는 추가하지 않았다.

1440×1000과 390×844 두 회귀의 완료 조건은 다음과 같다.

1. 확정 출전자가 기존 라인업의 경기에서 ROFL 업로드 창을 열고 파일·블루 팀을 선택한다. 실제 multipart action 성공 뒤 1세트·출전 10개·MMR 원장 10개를 확인한다. 참가자에게 관리자 취소 조작은 없다.
2. 같은 파일을 다음 세트에 올리면 409와 현재 상태 재확인 안내가 나오고, 파일·이미 저장된 결과·MMR을 유지한다.
3. 관리자가 UI 확인창에서 마지막 세트를 취소한다. Game은 삭제하지 않고 `cancelled`로 보존하며, MMR은 10개 역분개로 남는다.
4. 현재 화면에서 같은 파일을 다시 선택하면 같은 1세트 번호의 새 Game으로 복원한다. 기존 ROFL 선별 자료를 재사용하고 취소 기록을 보존한다.
5. 같은 경기 라인업과 앞서 쓴 챔피언으로 새 2세트 파일을 등록해 BO 시리즈가 자동 완료되는지 확인한다. 하드 피어리스는 결과 저장을 막지 않고, 라인업은 경기 전체에서 한 개다.

기존 test fixture가 만드는 합성 ROFL2 종료 메타데이터를 사용한다. 실제 League 클라이언트 원본 파일·Riot 라이브 API·실제 Discord OAuth 제공자를 통과한 검증은 아니다. 저장은 테스트 소유 schema에서만 일어나고 앱·DB·브라우저는 정리한다. 쿠키·세션 ID·환경 비밀 값은 출력·증거에 남기지 않는다.

이전 production build를 읽은 예비 실행은 2/2 통과했고 테스트 TypeScript도 통과했다. **390×844 보완 후 새 production build를 포함한 `pnpm test:browser` 전체 10개(기존 7 + 정상 ROFL 2 + 실제 편성/경매 연결 1)가 통과했다.** 최종 실행은 실패 0·취소 0·건너뜀 0이며 테스트 구간은 21,040ms다. 정상 ROFL 회귀는 1440×1000과 390×844에서 모두 통과했다. 최종 실행 로그 `/tmp/msm2-remaining-browser-final.log`를 직접 읽어 확인했으며 집계와 로그 SHA256은 [proofs.json](validation/proofs.json)에 기록했다.

## Firefox·WebKit의 변경 UI

[cross-engine.json](validation/cross-engine.json)에 16조건의 실제 실행값을 기록했다. Firefox 157.0과 WebKit 27.2에서 수동 편성·통계 × 1440×1000/390×844 × primary/dark를 확인했다.

- 16/16 HTTP 200, 단일 h1, 문서 가로 넘침 0, JS pageerror 0, POST 0.
- 예정 단계의 색·opacity와 기본 6/10 배치를 확인했다. 현재 단계·완료·예정의 구별을 유지하고 작은 화면의 글자·번호가 읽히는 실제 이미지를 보았다.
- 스위치 label은 두 엔진·두 폭·두 테마에서 44px 높이다. 실제 Space 입력은 `recent=1`로 이동하고, label의 패딩 위치 (2, 2) 클릭은 해제 상태로 돌아간다. 내부 thumb만 누르는 검사로 넓어진 조작 영역을 대체하지 않았다.
- 16장 전부 직접 이미지로 읽었다. 페이지마다 달라지는 기존 챔피언 아트의 픽셀 일치는 완료 조건으로 쓰지 않는다.

Chromium 156.0.8078.4·Firefox 157.0은 기본 설치로 실행됐다. WebKit 바이너리도 설치돼 있었으나 shared library 5개가 없어 처음에는 실행되지 않았다. 공식 Ubuntu 저장소의 패키지 5개(총 약 0.9MB)를 `/tmp`에 받아 추출하고, 공식 번들 환경과 그 라이브러리 경로를 함께 전달하는 임시 launcher로 같은 WebKit 바이너리를 실행했다. 시스템 패키지·프로젝트 의존성·브라우저 번들은 수정하지 않았다. 패키지 크기·SHA256과 직접 읽은 이미지 19개의 SHA256은 [proofs.json](validation/proofs.json)에 있다.

이는 Linux Playwright WebKit의 실제 엔진 검증이며 **macOS/iOS Safari 실기기 검증으로 부르지 않는다.** 물리 터치 장치도 사용하지 않았다.

## 실제 Orca의 생성 발화

[공식 Orca 소스](https://github.com/GNOME/orca)의 D-Bus·SpeechPresenter와 설치된 51.0 API를 확인했다. 별도 D-Bus 세션·Xvfb·AT-SPI Registry·임시 XDG 설정·별도 Speech Dispatcher dummy backend에서 Firefox를 실행했다. 기존 데스크톱의 Orca나 사용자 브라우저에 연결하지 않았다.

실제 Orca가 AT-SPI 이벤트에 반응해 생성한 발화 텍스트 25개를 [orca.json](validation/orca.json)에 보존했다. 단순 DOM 이름 검사 결과를 스크린리더 발화로 대체하지 않았다.

- 문서 제목과 web document, landmark 5개·heading 13개, 본문 건너뛰기 링크가 발화됐다.
- FAQ 펼침 뒤 `expanded`가 생성됐다. ROFL 목차 Enter는 실제 `#rofl` 제목으로 포커스를 옮겼다.
- 모바일 메뉴의 실제 패널 조작이 보이고 포커스가 dialog 안에 있으며 main은 inert다.
- `다크 모드, 꺼짐`→`다크 모드, 켜짐`의 한국어 이름 변화가 발화됐다. Escape는 `메뉴` 버튼으로 복귀했고 그 이름·button 역할이 다시 생성됐다.
- JS 예외 0, 실제 사업 데이터를 저장하는 조작 없음. 메뉴의 17번째 PNG도 직접 읽어 초점·패널·배경 상태를 확인했다.

TTS는 dummy 출력으로 격리했으므로 **실제 소리의 명료성·음성 청취·시각장애 사용자의 과업 성공을 검증한 것은 아니다.** NVDA·VoiceOver·점자장치·물리 기기는 미검증이다. 브라우저 UI와 Orca 시스템 역할 발화는 영어, 제품 이름·본문은 한국어로 나오는 현재 환경이다. 테스트 RPC 토큰·원시 디버그/DBus 환경·쿠키는 결과에 포함하지 않았다. 자체 생성한 브라우저·Orca·Registry·Speech Dispatcher·Xvfb와 D-Bus 세션을 종료했다.

## 성능 측정

최종 production build 뒤 격리 fixture에서 15회 탐색을 완료했다([원값·조건](validation/performance.json)). 실제 정상 결과 2세트·10명, 390×844, 매 탐색 새 브라우저 context, 로컬 앱은 warm, 외부 origin 차단, CPU/네트워크 인위적 제한 없음이라는 조건이다. 통계는 최소 게임 1 쿼리로 실제 10명의 행을 표시한다.

| 화면·3회 표본 | TTFB 중앙값(ms) | DOMContentLoaded 중앙값(ms) | LCP 중앙값(ms) | CLS 최대값 |
| --- | --- | --- | --- | --- |
| 홈 | 4.3 | 89.6 | 100 | 0 |
| 문서 | 5.2 | 71.4 | 76 | 0 |
| 경기 | 20.7 | 104.9 | 112 | 0.005634 |
| 선수 | 21.7 | 97.0 | 100 | 0 |
| 통계 | 14.1 | 90.9 | 112 | 0 |

15조건 모두 HTTP 200·문서 넘침 0·JS 예외 0이다. 정상 2세트 등록 뒤 실제 경기 2:0·하드 피어리스 안내와 선수 2게임·포지션 MMR이 표시된 추가 이미지 2개를 직접 읽어 기존 17개와 함께 19개의 SHA256을 기록했다. 이 fixture에서는 외부 CDN을 차단하므로 챔피언 이미지·웹폰트가 로드되지 않는 모습이며 제품의 이미지·브랜드 글꼴 품질 판정에 사용하지 않는다.

외부 폰트·이미지가 차단되고 브라우저 interception이 응답을 중계하는 로컬 랩이므로 리소스 전송 크기를 실배포 gzip/brotli 예산으로 읽지 않는다. 실제 서비스 CWV/INP·실기기 성능이나 이전 대비 개선율을 주장하지 않는다. 이 작은 표본에서 새로운 지연 병목을 확정하지 않았고 불필요한 성능 코드는 추가하지 않았다. 모든 fixture·앱·브라우저를 정리했으며 원시 Orca 디버그·토큰 관련 임시 자료도 삭제했다.
