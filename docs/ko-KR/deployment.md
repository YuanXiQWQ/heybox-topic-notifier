# 배포 설명

이 프로젝트는 Deno Deploy의 GitHub 통합으로 배포하며, GitHub Actions로 앱을 배포하지 않습니다. GitHub Actions는
`deno task check`만 실행하고, Deno Deploy가 repository push 이후 앱을 빌드하고 라우팅합니다.

## 브랜치 배포

Deno Deploy는 동일한 App에 대해 서로 다른 timeline을 생성합니다.

- `main`: 공식 릴리스 배포, Production URL로 라우팅
- `dev`: 릴리스 전 테스트 배포, Git Branch / DEV URL로 라우팅

현재 App 이름이 `heybox-topic-notifier`일 때 URL 규칙은 대략 다음과 같습니다.

```text
https://heybox-topic-notifier.yuanxiqwq.deno.net
https://heybox-topic-notifier--dev.yuanxiqwq.deno.net
```

현재 `dev` 테스트 배포는 이미 생성되었으며, 안정적인 테스트 진입점은 Git Branch / DEV URL입니다. 이후 `dev`로 push하면
테스트 배포가 업데이트되고, `main`으로 push하면 Production이 업데이트됩니다.

Deno Deploy의 GitHub 통합은 기능 브랜치 push에 대해 Git Branch timeline과 Build를 생성할 수 있습니다. Preview
및 일반 기능 브랜치가 KV를 반복해서 읽거나 Heybox를 가져오거나 알림을 보내지 않도록, 배포 entrypoint는 top level에서 Cron을 선언하지만 handler는
`DENO_TIMELINE=production` 또는 `DENO_TIMELINE=git-branch/dev`일 때만 계속 실행합니다. 일반 페이지 요청, 루트 경로,
health check, Warm up
요청은 자동 polling을 트리거하지 않습니다. 프런트엔드 페이지에서 1분 미만으로 도래한 조회는 제어된 상태 API를 통해 현재 계정의 스케줄링을 트리거합니다.

## Deno Deploy 구성

Deno Deploy App에서 다음 구성을 유지하세요.

- Repository: `YuanXiQWQ/heybox-topic-notifier`
- App Directory: root directory
- Entrypoint: `./src/deploy.ts`
- Config Source: `deno.json deploy section`

`deno.json`의 deploy 구성은 배포 entrypoint에 대한 유일한 repository 구성 소스입니다.

## 데이터베이스

Deno Deploy App에는 Deno KV 데이터베이스가 바인딩되어 있습니다. 코드는 `Deno.openKv()`
를 통해 계정, 설정, 기록, polling 상태, 처리된 게시물 마커를 읽고 씁니다. 계정 비밀번호는 salt가 적용된 PBKDF2 해시로 저장됩니다. 사용자 데이터는 user
ID prefix로 분리되며, Deno Deploy도 timeline 기준으로 Production과 Git Branch 데이터를 분리합니다.

## 런타임 환경 변수

Deno Deploy App에서 필요에 따라 구성하세요. repository 루트의 `.env.example`은 시나리오별로 정리되어 있습니다. 기본적으로는 최소 사용 가능 구성만 활성화되고,
그 외 polling 튜닝, 알림 채널, 릴레이, 보안 allowlist 구성은 주석 처리되어 있습니다. 사용할 시나리오에 해당하는 줄만 주석 해제하세요.

- 기본값: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `POLL_ENABLED`, `NOTIFIER_PROVIDER`
- Polling 튜닝: `POLL_INTERVAL_MINUTES`, `POLL_POST_LIMIT`, `POLL_SORT`
- Heybox 요청 override: `HEYBOX_SIGNATURE_MODE`, `HEYBOX_DEVICE_ID`, `HEYBOX_COOKIE`, `HEYBOX_USER_AGENT`
- 알림 공통 항목: `NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook 알림: `NOTIFIER_WEBHOOK_SERVICE`, `NOTIFIER_WEBHOOK_URL`,
  `NOTIFIER_PUSHPLUS_TOKEN`, `NOTIFIER_WXPUSHER_SPT`, `NOTIFIER_SERVER_CHAN_SEND_KEY`
- 이메일 알림: `NOTIFIER_EMAIL_SERVICE`, `NOTIFIER_EMAIL_ADDRESS`, `NOTIFIER_EMAIL_FROM`,
  `NOTIFIER_EMAIL_API_URL`, `NOTIFIER_EMAIL_API_TOKEN`, `NOTIFIER_SMTP_HOST`,
  `NOTIFIER_SMTP_PORT`, `NOTIFIER_SMTP_SECURE`, `NOTIFIER_SMTP_USERNAME`, `NOTIFIER_SMTP_PASSWORD`
- 알림 릴레이: `NOTIFIER_PUSHPLUS_SEND_URL`, `NOTIFIER_WXPUSHER_SEND_URL`,
  `NOTIFIER_SERVER_CHAN_SEND_URL`, `NOTIFIER_RELAY_TOKEN`
- 아웃바운드 보안 allowlist: `OUTBOUND_ALLOWED_HOSTS`

알림 전송은 custom Webhook, Email API, SMTP 대상을 검증합니다. 기본적으로는 공개 HTTPS URL과 일반적인 SMTP
포트만 허용합니다. self-hosted 릴레이 또는 고정 메일 서비스를 사용해야 하는 경우, 쉼표로 구분한 `OUTBOUND_ALLOWED_HOSTS`
로 해당 호스트를 명시적으로 허용할 수 있습니다. 예: `relay.example.com,smtp.example.com`.
이 변수를 설정한 뒤에는 알림 아웃바운드 대상이 목록의 호스트 또는 `*.example.com` 형식의 wildcard와 일치해야 합니다.

HTTP redirect는 hop마다 검증되며, same-origin redirect만 허용됩니다. `OUTBOUND_ALLOWED_HOSTS`가 구성되지 않은 경우 대상 호스트의 DNS
A/AAAA 해석 결과가 localhost, 내부 네트워크, link-local, metadata service, 예약 주소 범위에 속하지 않는지도 검증합니다. `OUTBOUND_ALLOWED_HOSTS`
는 관리자가 명시적으로 설정하는 신뢰 경계이며, wildcard는 완전히 제어하는 도메인 아래에서만 구성해야 합니다.

앱은 등록 및 로그인 페이지를 제공합니다. 계정 정보, 로그인 세션, 각 계정의 설정, 일치 기록, polling 상태, 알림 구성은
Deno KV에 저장되고 user ID 기준으로 분리됩니다. 브라우저 Cookie에는 random session token만 저장되고, 서버는 token
hash와 만료 시간을 저장합니다.

실제 Heybox 토픽 가져오기는 현재 유일한 런타임 데이터 소스입니다. 기본 `HEYBOX_SIGNATURE_MODE=app`은 검증된 App API
게시 시간 목록을 사용합니다. `web`은 진단용 fallback으로만 유지됩니다. `POLL_ENABLED`
는 새 계정 또는 기본 계정의 초기 polling 스위치일 뿐입니다. 실제 가져오기 여부는 각 계정 설정 페이지의 “Enable polling”에 따릅니다.

## 알림 릴레이

Deno Deploy가 PushPlus, WxPusher 또는 Server酱에 직접 접근할 수 없다면, 먼저 무료 Cloudflare Worker
릴레이를 배포할 수 있습니다. repository의 `workers/notification-relay.js`는 `/pushplus`, `/wxpusher`, `/serverchan`
세 가지 고정 전달 entry를 제공하며, `Authorization: Bearer <token>`으로 인증합니다. 전체 단계는 [worker.md](worker.md)를 참조하세요.

Deno Deploy 측 구성 예시:

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 검증

배포가 완료되면 다음에 접속하세요.

```text
/healthz
```

`status: ok`가 반환되면 서비스 프로세스가 시작된 것이며, health check는 Deno KV를 읽지 않습니다.