# 배포 설명

Oracle Cloud에서 Deno 서비스를 실행하며 Caddy가 HTTPS를 제공합니다. 계정, 세션, 게시물 기록은 Turso에 저장합니다. 릴리스 태그를 푸시하면 GitHub Actions에서 Windows 및 Android 설치 파일을 빌드합니다.

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## 런타임 환경 변수

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

검증용 인스턴스에는 별도 데이터베이스를 사용하세요. 기존 주기적 확인을 중지한 후 운영 환경에 `VM_POLLING_ENABLED=true` 를 설정하고 서비스를 다시 시작하세요.

- 기본값: `APP_LOCALE`, `HEYBOX_TOPIC_ID`, `NOTIFIER_PROVIDER`
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

실제 Heybox 토픽 가져오기는 현재 유일한 런타임 데이터 소스입니다. 기본 `HEYBOX_SIGNATURE_MODE=app`은 검증된 App API
게시 시간 목록을 사용합니다. `web`은 진단용 fallback으로만 유지됩니다.
새 계정은 polling이 꺼진 상태로 시작하며, 설정 페이지에서 “Enable polling”을 켠 뒤에만 실제로 가져옵니다.

## 알림 릴레이

Oracle Cloud가 PushPlus, WxPusher 또는 Server酱에 직접 접근할 수 없다면, 먼저 무료 Cloudflare Worker
릴레이를 배포할 수 있습니다. repository의 `workers/notification-relay.js`는 `/pushplus`, `/wxpusher`, `/serverchan`
세 가지 고정 전달 entry를 제공하며, `Authorization: Bearer <token>`으로 인증합니다. 전체 단계는 [worker.md](worker.md)를 참조하세요.

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 검증

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
