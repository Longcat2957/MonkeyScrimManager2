# 출시 준비의 격리 검증

2026-11-15. 저장소의 CI·systemd/nginx 예제·DB 백업/복원 도구와 [운영 문서](../../../docs/deployment.md)를 구현했다. 실제 운영 서비스·계정·자격 증명·인증서·DB는 사용하지 않았다. 기존 컨테이너와 volume을 수정하지 않았다.

## 적용한 파일

- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml): Ubuntu 24.04, Node 24, pnpm 10.20.0, 전용 PostgreSQL, Chromium. 기존 check/check:tests/test/build:bot/hard/browser와 격리 배포 검사. hard/browser의 새 웹 build 계약을 유지하고 세 번째 독립 웹 build는 추가하지 않는다. 원격 workflow는 아직 실행하지 않았다.
- [웹](../../../deploy/monkeybot-web.service.example)·[봇](../../../deploy/monkeybot-bot.service.example) systemd 예제: 지정한 실행 사용자·환경 파일, 실패 재시작, SIGTERM, 제한된 파일 쓰기. 실제 unit을 설치하거나 시작하지 않았다.
- [HTTPS 사이트](../../../deploy/nginx.conf.example)와 [프록시 조각](../../../deploy/nginx-internal.conf.example): HTTP→HTTPS, 내부 경로 차단, 요청 크기/시간 제한, 업로드 request buffering 끄기, HTTPS 헤더 덮어쓰기. callback code/state는 access log와 해당 경로의 error log에 남기지 않는다.
- [웹 환경 예제](../../../apps/web/.env.example): 설치된 adapter-node 6이 실제로 읽는 `PROTOCOL_HEADER=x-forwarded-proto`·로컬 bind·크기·종료 제한 명시.
- [백업 도구](../../../scripts/database_backup.mjs): 전용 URL 환경 변수, 비밀을 argv에 넣지 않는 libpq 환경 전달, custom archive와 SHA256·0600, 덮어쓰기 거절, 명시적 빈 DB 복원, 단일 트랜잭션. 일반 `DATABASE_URL` 자동 사용·기존 객체 삭제는 없다.
- [격리 검사](../../../scripts/verify_deployment.mjs): 직접 만든 label 소유 자원만 검사·정리하며 기존 production build를 사용한다. 새 제품 endpoint는 추가하지 않았다.

## 실제 실행 결과

`node scripts/verify_deployment.mjs --report artifacts/ui-review/operations/deployment.json` 최종 실행이 5단계 모두 통과했다. [원값](deployment.json)에 시작/종료 시각·단계 시간·검사 파일/실제 build/migration SHA256·이미지 ID·소유 label과 정리 결과를 기록했다. Node v24.22.3, Docker 29.9.3, 실제 migration은 `0000`~`0007`이다.

| 검사 | 확인한 결과 |
| --- | --- |
| systemd | 실행 사용자·경로를 임시 값으로 렌더링한 두 unit의 `systemd-analyze verify` 통과. 서비스 기동 없음 |
| DB 준비 | 직접 만든 PostgreSQL 17에 실제 `drizzle-kit migrate` 적용. 업무 테이블 41개, migration journal 1개와 별도 검증 테이블 2개로 전체 44개 |
| 백업·복원 | 전체 테이블 행 hash·제약 271개·FK 94개·sequence 상태 일치. 업무 schema와 migration journal, 별도 검증 자료의 Unicode·null·큰 정수·정밀 숫자·FK·identity 보존 |
| 보호 경로 | 기존 dump 덮어쓰기, 확인 인자 누락, 비어 있지 않은 대상 DB, SHA256 오류를 거절. 실패한 dump와 검증 파일 없음. 원본 격리 DB snapshot 무변경. 파일 권한 0600 |
| 실제 HTTPS 프록시 | 운영 `/docs` 200, HTTP 308 이동. `/internal`·하위·인코딩 경로 4개가 모두 404. 올바른 HTTPS origin은 없는 action의 405, 다른 origin은 403. 위조 `X-Forwarded-Proto`는 nginx가 덮어씀 |
| 제한·종료·로그 | 제한 초과 Content-Length에 413. 웹 SIGTERM exit 0. 앱을 종료한 뒤의 callback upstream 502가 시험용 code 값을 error log에 남기지 않음. 일반 경로의 502는 제어용 표식이 남아 로그 자체가 동작함을 대조 |
| 정리 | 소유 label을 확인한 컨테이너 2개와 자체 생성 프로세스·tmpfs·인증서·dump·임시 파일 제거. 기존 컨테이너/volume 선택·prune 없음 |

기존 업무 테이블에는 운영 자료를 넣지 않았다. 백업 자료의 값 보존은 별도의 검증 schema를 사용했다. 실제 ROFL·MMR 자료의 운영 백업을 복원했다고 주장하지 않는다. TLS 검사는 하루짜리 로컬 자체 서명 인증서를 신뢰해 실제 nginx와 adapter-node를 통과한 검사다. 공인 인증서·실제 VPS 검증은 아니다.

공식 actionlint 1.7.12 arm64 archive를 GitHub 릴리스의 checksum과 대조한 뒤 workflow 정적 검사를 통과했다. 호스트에 shellcheck가 없어 해당 연동은 끈 상태이며 workflow의 run은 기존 단일 명령들이다. 신규 Node 스크립트 2개의 구문 검사와 scoped Prettier·diff 검사도 통과했다. GitHub Actions 원격 통과 결과로 대체하지 않는다.

## 남은 적용·검증

실제 도메인·VPS 경로/사용자·Node 설치·TLS 발급/갱신·DB TLS/계정·백업 저장/암호화/보존/복구 목표는 운영 환경에서 정해야 한다. 실제 migration·배포·복구와 봇 연결은 실행하지 않았다. 실제 Discord 로그인·명령 등록·게시/DM, 약관/개인정보 본문 보류, 실기기·실제 음성 청취 미검증도 유지한다.

DB query/statement timeout, 업로드 처리량 제한, 비밀을 제외한 앱 요청 ID·업무 오류·처리 시간 관측은 기존 운영 기준의 별도 후속 작업이다. 해당 앱 소스·업무 schema는 이 작업자가 수정하지 않았다. 현재 보호 조치·표본 통과만으로 출시 준비 전체가 끝났다고 합산하지 않는다.
