# Heybox 토픽 알림 도구

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **한국어** |
| :-------------------------: | :--------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

설정에서 관심 주제를 추가하고 키워드, 정규식 또는 AI로 게시물을 선별한 뒤 주기적 확인을 켜세요. 조건에 맞는 게시물은 작업 공간에 표시되며 기록으로 옮기거나 다시 복원할 수 있습니다.

새 계정에는 초대 코드가 필요합니다. 앱 알림은 기기별로 켜며 이메일이나 Webhook과 함께 사용할 수 있습니다. 오프라인 편집은 연결이 복구되면 동기화됩니다. 언어와 다크 모드는 기본적으로 기기 설정을 따릅니다.

## 기능

- 대시보드: 폴링 상태, 전체 일치 수, 최신 일치 항목, 대기 중인 일치 항목을 확인하고 수동 확인 실행
- 설정 페이지: 토픽 ID, 활성화 상태, 메모, 폴링 간격 단위, 게시물 제한, 정렬 모드, UI 언어,
  다크 모드, 테마 색상 설정
- 계정 설정: 회원가입, 로그인, 로그아웃, 사용자 이름 업데이트, 비밀번호 업데이트; 계정 데이터는
  사용자 ID별로 분리
- 키워드 규칙: 공유 규칙, 토픽별 규칙, 일치 위치, 대소문자 구분, 정규식 지원
- 설정 → 알림 설정 → 테스트 알림
- 알림 채널: 사용자 지정 Webhook, ServerChan, PushPlus, WxPusher, email API, SMTP
- 알림 릴레이: PushPlus, WxPusher, ServerChan을 위한 선택적 Cloudflare Worker 릴레이

## 로컬 개발

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## 배포

Oracle Cloud에서 Deno 서비스를 실행하며 Caddy가 HTTPS를 제공합니다. 계정, 세션, 게시물 기록은 Turso에 저장합니다. 릴리스 태그를 푸시하면 GitHub Actions에서 Windows 및 Android 설치 파일을 빌드합니다.

[서버 설치](./deployment.md) · [Cloudflare Worker](./worker.md)

## 라이선스

이 프로젝트는 [GNU Affero General Public License v3.0](../../LICENSE)에 따라 라이선스가 부여됩니다.
