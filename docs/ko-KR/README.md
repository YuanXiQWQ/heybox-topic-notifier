# Heybox 토픽 알림 도구

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **한국어** |
|:-----------------------:|:-------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
는 Heybox 토픽 게시물을 모니터링하기 위한 가벼운 Deno 앱입니다. 각 계정의 설정에 따라 실제 토픽 게시물을
주기적으로 읽고, 제목, 본문, 댓글, 답글을 키워드 규칙과 대조하며, 일치 항목을 pending 및 history 보기로
기록하고, 설정된 채널을 통해 알림을 보냅니다.

## 기능

- 대시보드: 폴링 상태, 전체 일치 수, 최신 일치 항목, 대기 중인 일치 항목을 확인하고 수동 확인 실행
- 설정 페이지: 토픽 ID, 활성화 상태, 메모, 폴링 간격 단위, 게시물 제한, 정렬 모드, UI 언어,
  다크 모드, 테마 색상 설정
- 계정 설정: 회원가입, 로그인, 로그아웃, 사용자 이름 업데이트, 비밀번호 업데이트; 계정 데이터는
  사용자 ID별로 분리
- 키워드 규칙: 공유 규칙, 토픽별 규칙, 일치 위치, 대소문자 구분, 정규식 지원
- 일치 테이블: pending 및 history 기록 모두 시간 범위 필터, 페이지네이션, 일괄 완료, 삭제 작업 지원
- 디버그 항목: 시뮬레이션된 일치 항목과 알림 테스트, 수동 폴링 및 디버그 작업에 대한 서버 측 속도 제한 포함
- 알림 채널: 사용자 지정 Webhook, ServerChan, PushPlus, WxPusher, email API, SMTP
- 알림 릴레이: PushPlus, WxPusher, ServerChan을 위한 선택적 Cloudflare Worker 릴레이
- 보안: PBKDF2 비밀번호 해시, KV 기반 세션, CSRF 토큰, 보안 헤더, 감사 로그,
  DNS 검증을 포함한 아웃바운드 allowlist

## 스택

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + 로컬 타이머 스케줄러
- 서버 렌더링 HTML + 순수 JavaScript/CSS
- 알림 릴레이용 Cloudflare Workers 스크립트

## 로컬 개발

개발 서버를 시작합니다:

```powershell
deno task dev
```

그다음 엽니다:

```text
http://localhost:8000
```

기본값을 재정의하려면 `.env.example`을 참고하여 런타임 환경에서 해당 환경 변수를 설정하세요.
첫 방문 시 계정을 등록하세요. 환경 변수는 새 계정 또는 기본 데이터의 초기값만 채우며, 이후에는 각
계정의 설정 페이지가 단일 기준 정보가 됩니다.

앱은 회원가입 및 로그인 페이지를 제공합니다. 각 계정에는 독립된 설정, 일치 기록, 폴링 상태,
알림 구성이 있으므로 같은 배포 URL을 공유하는 사용자들도 데이터를 공유하지 않습니다. 사용자 비밀번호는
평문이 아니라 salt가 적용된 PBKDF2 해시로 Deno KV에 저장됩니다. 로그인 세션은 Deno KV에 저장되고,
브라우저 쿠키에는 무작위 세션 토큰만 포함됩니다. 설정, 계정, 디버그 변경은 CSRF 토큰을 검증하며,
공개 배포에서는 민감한 작업에 속도 제한이 적용됩니다.

## 명령어

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen`은 처리된 게시물 마커를 지워 같은 게시물을 다시 검증할 수 있게 합니다. 프로덕션에서는
주의해서 사용하세요.

## 배포

Deno Deploy 설정은 [deployment](./deployment.md)를 참조하세요. 앱 엔트리포인트는 `deno.json`의
`deploy` 섹션에서 정의됩니다. GitHub Actions는 검사만 실행하며 앱을 배포하지 않습니다.
`src/deploy.ts`의 배포 엔트리포인트는 Deno Deploy Cron을 선언하고, 실제 폴링은 Production 및
`dev` Git Branch 타임라인에서만 실행됩니다. 알림 릴레이 Worker 설정은 [worker](./worker.md)를 참조하세요.

## 라이선스

이 프로젝트는 [GNU Affero General Public License v3.0](../../LICENSE)에 따라 라이선스가 부여됩니다.