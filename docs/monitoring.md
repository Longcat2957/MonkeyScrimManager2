# API 성능 모니터링

Grafana 대시보드, Prometheus 메트릭, 요청 JSON 로그, `db_slow` 로그를 함께 읽는다. 집계만 보면 원인을 찾기 어렵고, 개별 로그만 보면 전체 추세를 놓친다.

## 접근

- Grafana: `https://monkeybot.lol/grafana/`
- 기본 대시보드: `Monkeybot API 성능`
- 기본 조회 범위: 최근 6시간, 30초 자동 갱신
- 장애 분석: `Last 15 minutes` 또는 `Last 1 hour`로 좁힌다.
- 직접 쿼리: 왼쪽 `Explore` → 데이터 소스 `Prometheus`

관리자 계정은 `/etc/monkeybot/grafana.env`의 최초 값으로 만든다. `GF_SECURITY_ADMIN_PASSWORD`는 최초 기동에만 적용된다. 이후 변경·분실은 Grafana UI 또는 아래 명령을 쓴다.

```sh
cd /opt/monkeybot
docker compose exec -T grafana grafana cli admin reset-admin-password '새 비밀번호'
```

대시보드는 저장소의 프로비저닝 파일이 기준이다. UI에서 수정해도 재기동 시 저장소 값으로 돌아간다.

## 데이터 계층

| 계층 | 저장 위치 | 용도 |
| --- | --- | --- |
| Prometheus 메트릭 | `monkeybot-prometheus-data` 볼륨, 30일 | 추세·비율·백분위·replica 비교 |
| 요청 로그 | 웹 stdout, Docker json-file | 개별 요청의 구간·DB·외부 호출 시간 |
| `db_slow` 로그 | 웹 stdout, Docker json-file | 200ms 이상 SQL의 fingerprint |
| 서비스 상태 | 백오피스 | DB·봇 연결 상태와 단순 지연 |

메트릭은 웹 프로세스 누적 값이다. 재시작하면 raw 값이 0부터 다시 시작하며 Prometheus는 `instance` label로 replica를 구분한다.

## 대시보드 패널

| 패널 | 읽는 법 | 이상 신호 |
| --- | --- | --- |
| 초당 요청 | route별 `rate` | 특정 route 급증. `/internal/bot/*`는 봇 주기 호출 |
| 요청 p95 | 전체 응답 시간의 95% 상한 | 특정 route만 상승하면 그 화면 문제 |
| 5xx 비율 | 서버 오류 비율 | 4xx는 제외. 인증·검증 실패는 정상 |
| DB 쿼리 p95 | 모든 SQL의 95% 상한 | 요청 p95와 같이 오르면 DB 병목 |
| 외부 호출 p95 | Riot·Discord·Data Dragon·봇 | 대상별로 분리해 원인 확인 |
| DB 풀 연결 | total·idle·waiting | `waiting > 0`이 지속되면 풀 포화 |
| 프로세스 | RSS·heap·uptime | uptime 하락은 재시작·배포 |

`p95`는 “95%의 요청이 이 시간 이하”라는 뜻이다. 평균보다 느린 사용자를 찾는 데 쓴다.

## Prometheus 쿼리

`Explore`의 Prometheus 데이터 소스에 붙여 넣는다. 창은 기본 5분이며, 짧은 장애는 1분, 완만한 추세는 15분으로 바꾼다. `rate`는 scrape 2회 이상이 필요하다.

### 사용자 요청만

```promql
sum by (route) (rate(msm2_http_requests_total{kind!="internal"}[5m]))
```

### route별 p95

```promql
histogram_quantile(
  0.95,
  sum by (le, route) (rate(msm2_http_request_duration_seconds_bucket[5m]))
)
```

### 느린 route 상위 5개

```promql
topk(5,
  histogram_quantile(
    0.95,
    sum by (le, route) (rate(msm2_http_request_duration_seconds_bucket[5m]))
  )
)
```

### 5xx만

```promql
sum by (route, status, code) (
  rate(msm2_http_requests_total{status=~"5.."}[5m])
)
```

### 4xx 확인

4xx는 사용자 입력·인증·권한 실패다. 5xx와 분리해서 본다.

```promql
sum by (route, status, code) (
  rate(msm2_http_requests_total{status=~"4.."}[5m])
)
```

### DB 오류

```promql
sum by (outcome) (rate(msm2_db_queries_total[5m]))
```

### 외부 호출 오류

```promql
sum by (target, outcome) (rate(msm2_upstream_requests_total[5m]))
```

### 외부 대상별 p95

```promql
histogram_quantile(
  0.95,
  sum by (le, target) (rate(msm2_upstream_request_duration_seconds_bucket[5m]))
)
```

### DB 풀

```promql
msm2_db_pool_connections
```

### replica별 확인

```promql
sum by (instance, route) (rate(msm2_http_requests_total[5m]))
```

### 프로세스 재시작 확인

```promql
msm2_process_uptime_seconds
```

값이 갑자기 작아지면 해당 인스턴스가 재시작됐다.

## 판단 순서

1. 요청 p95가 올랐는지 본다.
2. route label로 어느 화면·API인지 좁힌다.
3. DB 쿼리 p95도 올랐는지 본다.
4. DB 풀 `waiting`이 지속되는지 본다.
5. 외부 호출 p95가 올랐는지 대상별로 본다.
6. DB·외부가 정상이면 앱 코드·렌더링·직렬화를 본다.
7. 개별 요청은 `X-Request-ID`로 로그를 찾는다.

대표 조합:

| 조합 | 해석 |
| --- | --- |
| 요청 p95 ↑ + DB p95 ↑ | DB 병목 |
| 요청 p95 ↑ + 외부 p95 ↑ | Riot·Discord·Data Dragon·봇 지연 |
| 요청 p95 ↑ + DB/외부 정상 + waiting 0 | 앱 코드·렌더링 |
| DB waiting > 0 지속 | 풀 부족 또는 느린 트랜잭션 |
| 5xx ↑ + `code=DB_CONNECTION_TIMEOUT` | DB 연결 실패 |
| 5xx ↑ + `code=ROFL_*` | ROFL 제한·처리 실패 |
| 5xx ↑ + `code=DISCORD_UNAVAILABLE` | Discord 연동 실패 |

## 요청 로그

```sh
cd /opt/monkeybot
docker compose logs --no-log-prefix web | grep '"event":"request"'
```

`jq`가 있으면:

```sh
docker compose logs --no-log-prefix web \
  | jq -c 'select(.event=="request") | {route, durationMs, phases, db, upstream}'
```

로그 예:

```json
{
  "event": "request",
  "requestId": "…",
  "route": "/g/[guildId]/matches/[matchId]",
  "kind": "page",
  "method": "GET",
  "status": 200,
  "code": null,
  "durationMs": 123.45,
  "phases": { "sessionMs": 2.1, "accessMs": 18.3 },
  "db": { "count": 7, "totalMs": 55.3, "maxMs": 21.4, "waitMs": 0.4, "slow": 0 },
  "upstream": { "riot": { "count": 2, "totalMs": 40.1, "maxMs": 25.0 } }
}
```

| 필드 | 의미 |
| --- | --- |
| `requestId` | 응답 헤더 `x-request-id`와 같은 값 |
| `route` | manifest의 route 템플릿. 실제 param·query 없음 |
| `kind` | `page`·`data`·`action`·`api`·`internal`·`unmatched` |
| `method` | 허용된 HTTP method |
| `status` | 응답 상태 |
| `code` | 허용된 업무·운영 오류 코드. 성공은 `null` |
| `durationMs` | 서버가 응답 객체를 만들 때까지의 전체 시간 |
| `phases.sessionMs` | 세션 검증 |
| `phases.accessMs` | 길드 접근 확인 |
| `db.count` | SQL 호출 수. 트랜잭션 제어 포함 |
| `db.totalMs` / `maxMs` | SQL 누적·최대 |
| `db.waitMs` | DB 풀 연결 대기 |
| `db.slow` | 200ms 이상 SQL 수 |
| `upstream.*` | 외부 호출 수·누적·최대 |

`durationMs`와 `db.totalMs`는 더해도 전체와 정확히 같지 않다. 렌더링·직렬화·대기 시간이 따로 있기 때문이다. `upstream`은 실제 호출이 있을 때만 포함된다.

## 느린 SQL

200ms 이상 SQL은 별도 줄로 나온다.

```sh
docker compose logs --no-log-prefix web | grep '"event":"db_slow"'
```

```json
{"event":"db_slow","requestId":"…","route":"/g/[guildId]/stats","durationMs":812.4,"fingerprint":"a1b2c3d4e5f6"}
```

- SQL 원문·매개변수는 기록하지 않는다.
- `fingerprint`가 같으면 같은 SQL 형태다.
- `requestId`로 같은 요청의 일반 로그를 찾는다.
- 같은 fingerprint가 반복되면 해당 쿼리·인덱스를 점검한다.
- `fingerprint`만으로 SQL을 복원할 수 없으므로 필요하면 개발 환경에서 같은 route의 쿼리를 재현한다.

## 한계

- 메트릭은 프로세스 누적이다. 재시작하면 raw 값이 0으로 돌아간다. 비율은 `rate()`를 쓴다.
- 요청 단위 추적은 메트릭 label이 아니라 로그 `requestId`로 한다. `requestId`를 label로 넣지 않는다.
- DB 메트릭에는 route label이 없다. route별 DB 시간은 요청 로그의 `db.maxMs`로 본다.
- p95는 histogram bucket 근사값이다. HTTP·DB·외부 모두 30초 상한 bucket이 마지막이라 30초 초과는 정확히 구분되지 않는다.
- Prometheus는 15초마다 scrape한다. 그보다 짧은 순간 spike는 놓칠 수 있다.
- `/metrics` 자체 요청은 `kind="internal"`로 잡힌다. 사용자 요청과 섞이면 `kind!="internal"`로 거른다.
- 봇 주기 호출이 많은 환경에서는 `kind="internal"` 요청이 사용자 트래픽보다 많을 수 있다.

## 운영 명령

```sh
cd /opt/monkeybot
docker compose ps
docker compose logs --tail=100 prometheus grafana
curl -sS -o /dev/null -w '%{http_code}\n' https://monkeybot.lol/metrics
curl -sS -o /dev/null -w '%{http_code}\n' https://monkeybot.lol/grafana/api/health
```

`/metrics`는 404, Grafana health는 200이 정상이다. `monkeybot-prometheus-data`·`monkeybot-grafana-data` 볼륨은 삭제하지 않는다.
