#!/usr/bin/env bash
# 校验标签归档，预缓存依赖，原子切换发布目录，并验证线上提交与资源；失败恢复上一版本。
set -Eeuo pipefail
umask 077
if [[ $(id -u) != 0 || $# -lt 4 || $# -gt 5 ]]; then
  echo "Usage: sudo deploy.sh candidate|production COMMIT ARCHIVE SHA256 [VERSION]" >&2
  exit 2
fi
slot=$1
revision=$2
archive=$(realpath -- "$3")
digest=$4
version=${5:-dev}
[[ $revision =~ ^[0-9a-f]{40}$ && $digest =~ ^[0-9a-f]{64}$ ]] || exit 2
[[ $version == dev || $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
root=/opt/heybox-topic-notifier
exec 9>/run/lock/heybox-deploy.lock
flock -n 9 || { echo "Another deployment is active." >&2; exit 1; }
case "$slot" in
  candidate) link=$root/candidate; service=heybox-topic-notifier-candidate; config=/etc/heybox-topic-notifier/candidate.env ;;
  production) link=$root/current; service=heybox-topic-notifier; config=/etc/heybox-topic-notifier/heybox.env ;;
  *) exit 2 ;;
esac
[[ -f $config && -f $archive ]] || exit 2
origin=$(sed -n 's/^PUBLIC_ORIGIN=//p' "$config" | tr -d '\r"\047')
port=$(sed -n 's/^PORT=//p' "$config" | tr -d '\r"\047')
[[ $origin =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ && $port =~ ^[0-9]+$ ]] || exit 2
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
if tar -tzf "$archive" | awk '/^\// || /(^|\/)\.\.(\/|$)/ {bad=1} END {exit !bad}'; then
  echo "Archive contains an unsafe path." >&2; exit 2
fi
if tar -tvzf "$archive" | awk 'substr($0,1,1) ~ /[lh]/ {bad=1} END {exit !bad}'; then
  echo "Archive links are not allowed." >&2; exit 2
fi
release=$root/releases/$revision-$version
previous=""
if [[ -L $link ]]; then
  previous=$(readlink -f "$link")
  [[ $previous == "$root/releases/"* && -d $previous ]] || exit 2
elif [[ -e $link ]]; then
  echo "Deployment target must be a release symlink." >&2; exit 2
fi
switched=false
created=false
staging=""

# /**
# 退出时清理本次准备目录，失败则恢复应用链接；业务数据和环境文件不回退。
# */
finish() {
  code=$?
  trap - EXIT
  set +e
  if [[ $code != 0 && $switched == true ]]; then
    if [[ -n $previous ]]; then
      ln -sfn "$previous" "$link.next" && mv -Tf "$link.next" "$link"
      systemctl reset-failed "$service"
      systemctl restart "$service"
      restored=false
      for attempt in {1..30}; do
        if systemctl is-active --quiet "$service" && curl --fail --silent --max-time 3 -H "Host: ${origin#https://}" "http://127.0.0.1:$port/healthz" | grep -q '"status":"ok"'; then
          restored=true; break
        fi
        sleep 1
      done
      echo "Deployment failed; previous release restored; healthy=$restored" >&2
    else
      systemctl stop "$service"
      echo "Deployment failed; service stopped without a previous version." >&2
    fi
  fi
  if [[ -n $staging && $staging == "$root/releases/.prepare."* ]]; then rm -rf -- "$staging"; fi
  if [[ $code != 0 && $created == true && ( $switched == false || ${restored:-false} == true ) && $(readlink -f "$link") != "$release" ]]; then
    rm -rf -- "$release"
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ -d $release ]]; then
  [[ -f $release/.archive-sha256 && $(cat "$release/.archive-sha256") == "$digest" ]] || exit 2
else
  staging=$(mktemp -d "$root/releases/.prepare.XXXXXXXX")
  tar -xzf "$archive" -C "$staging" --no-same-owner --no-same-permissions
  [[ -f $staging/src/self_hosted.ts && -f $staging/deno.lock ]] || exit 2
  printf 'APP_VERSION=%s\nAPP_DEPLOYMENT_ID=%s\n' "$version" "$revision" > "$staging/.deploy.env"
  printf '%s\n' "$digest" > "$staging/.archive-sha256"
  chmod -R a+rX "$staging"
  mv -T "$staging" "$release"
  created=true
  staging=""
fi
cd "$release"
runuser -u heybox -- env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/var/lib/heybox DENO_DIR=/var/cache/heybox deno cache --frozen src/self_hosted.ts
# 配置预检只调用纯配置校验器，不建立数据库连接或启动第二个后台。
systemd-run --quiet --wait --pipe --collect --unit="heybox-config-check-$slot" --property=User=heybox --property="WorkingDirectory=$release" --property="EnvironmentFile=$config" --setenv=HOME=/var/lib/heybox --setenv=DENO_DIR=/var/cache/heybox --setenv="APP_VERSION=$version" --setenv="APP_DEPLOYMENT_ID=$revision" /usr/local/bin/deno eval --cached-only --frozen 'import { selfHostedConfig } from "./src/self_hosted_runtime.ts"; selfHostedConfig();'
ln -sfn "$release" "$link.next"
mv -Tf "$link.next" "$link"
switched=true
systemctl reset-failed "$service"
systemctl restart "$service"
healthy=false
for attempt in {1..30}; do
  if systemctl is-active --quiet "$service" && curl --fail --silent --max-time 3 -H "Host: ${origin#https://}" "http://127.0.0.1:$port/healthz" | grep -q '"status":"ok"'; then
    healthy=true; break
  fi
  sleep 1
done
[[ $healthy == true ]]
# 运行进程的工作目录必须解析到本次发行，避免仅凭任意健康响应判断已切换。
pid=$(systemctl show "$service" -p MainPID --value)
[[ $pid =~ ^[1-9][0-9]*$ && $(readlink -f "/proc/$pid/cwd") == "$release" ]]
# 候选环境可能使用独立反向代理；正式发布还须验证用户实际访问的 HTTPS 入口。
if [[ $slot == production ]]; then
  python3 - "$origin" "$revision" "$release" <<'PY'
import hashlib
import json
import pathlib
import sys
import urllib.request

origin, revision, release = sys.argv[1:]
headers = {"Cache-Control": "no-cache", "User-Agent": "heybox-deploy-verification"}
with urllib.request.urlopen(urllib.request.Request(origin + "/healthz", headers=headers), timeout=20) as response:
    health = json.load(response)
supports_revision = "APP_DEPLOYMENT_ID" in pathlib.Path(release, "src/routes.ts").read_text()
if health.get("status") != "ok" or (supports_revision and health.get("deploymentId") != revision):
    raise RuntimeError("Public service is not running the expected commit")
# 只验证认证豁免的资源，避免把登录保护脚本的重定向误判为发行内容。
for name in ("app.css", "app-navigation.js"):
    expected = pathlib.Path(release, "static", name)
    if not expected.is_file():
        raise RuntimeError("Required application asset is missing: " + name)
    with urllib.request.urlopen(urllib.request.Request(origin + "/static/" + name, headers=headers), timeout=20) as response:
        actual = response.read()
    if hashlib.sha256(actual).digest() != hashlib.sha256(expected.read_bytes()).digest():
        raise RuntimeError("Public application asset differs from the release: " + name)
with urllib.request.urlopen(urllib.request.Request(origin + "/login", headers=headers), timeout=20) as response:
    login = response.read().decode("utf-8")
if 'src="/static/app-navigation.js"' not in login or "data-app-back" not in login:
    raise RuntimeError("Public page does not include application navigation")
PY
fi
printf '%s\n' "$previous" > "$root/$slot-previous-release"
printf '%s\n' "$revision" > "$root/$slot-deployed-sha"
echo "Deployment health check passed: $slot $revision"
