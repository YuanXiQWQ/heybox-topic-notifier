#!/usr/bin/env bash
# 校验本地归档，预缓存依赖，原子切换发布目录；健康检查失败时恢复上一版本。
set -euo pipefail
umask 077
if [[ $(id -u) != 0 || $# != 4 ]]; then
  echo "Usage: sudo deploy.sh candidate|production COMMIT ARCHIVE SHA256" >&2
  exit 2
fi
slot=$1
revision=$2
archive=$(realpath -- "$3")
digest=$4
[[ $revision =~ ^[0-9a-f]{40}$ && $digest =~ ^[0-9a-f]{64}$ ]] || exit 2
root=/opt/heybox-topic-notifier
case "$slot" in
  candidate) link=$root/candidate; service=heybox-topic-notifier-candidate; config=/etc/heybox-topic-notifier/candidate.env ;;
  production) link=$root/current; service=heybox-topic-notifier; config=/etc/heybox-topic-notifier/heybox.env ;;
  *) exit 2 ;;
esac
[[ -f $config && -f $archive ]] || exit 2
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
if tar -tzf "$archive" | awk '/^\// || /(^|\/)\.\.(\/|$)/ {bad=1} END {exit !bad}'; then
  echo "Archive contains an unsafe path." >&2; exit 2
fi
if tar -tvzf "$archive" | awk 'substr($0,1,1) ~ /[lh]/ {bad=1} END {exit !bad}'; then
  echo "Archive links are not allowed." >&2; exit 2
fi
release=$root/releases/$revision
if [[ -d $release ]]; then
  [[ -f $release/.archive-sha256 && $(cat "$release/.archive-sha256") == "$digest" ]] || exit 2
else
  install -d -m 0755 "$release"
  tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
  [[ -f $release/src/self_hosted.ts && -f $release/deno.lock ]] || exit 2
  chmod -R a+rX "$release"
  printf '%s\n' "$digest" > "$release/.archive-sha256"
fi
cd "$release"
runuser -u heybox -- env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/var/lib/heybox DENO_DIR=/var/cache/heybox deno cache --frozen src/self_hosted.ts
previous=""
if [[ -L $link ]]; then
  previous=$(readlink -f "$link" || true)
  [[ $previous == "$root/releases/"* && -d $previous ]] || previous=""
elif [[ -e $link ]]; then
  echo "Deployment target must be a release symlink." >&2; exit 2
fi
switched=false

# 失败后只恢复应用链接，业务数据及环境文件不被旧快照覆盖。
rollback() {
  code=$?
  if [[ $switched == true ]]; then
    if [[ -n $previous && -d $previous ]]; then
      ln -sfn "$previous" "$link.next"
      mv -Tf "$link.next" "$link"
      systemctl restart "$service" || true
      echo "Deployment failed; previous application restored. Verify service health." >&2
    else
      systemctl stop "$service" || true
      echo "Candidate deployment failed; stopped without a previous version." >&2
    fi
  fi
  exit "$code"
}
trap rollback ERR
ln -sfn "$release" "$link.next"
mv -Tf "$link.next" "$link"
switched=true
systemctl restart "$service"
origin=$(sed -n 's/^PUBLIC_ORIGIN=//p' "$config" | tr -d '\r"\047')
port=$(sed -n 's/^PORT=//p' "$config" | tr -d '\r"\047')
[[ $origin == https://* && $port =~ ^[0-9]+$ ]] || false
healthy=false
for attempt in {1..30}; do
  if systemctl is-active --quiet "$service" && curl --fail --silent --max-time 3 -H "Host: ${origin#https://}" "http://127.0.0.1:$port/healthz" | grep -q '"status":"ok"'; then
    healthy=true; break
  fi
  sleep 1
done
[[ $healthy == true ]]
printf '%s\n' "$previous" > "$root/$slot-previous-release"
printf '%s\n' "$revision" > "$root/$slot-deployed-sha"
trap - ERR
echo "Deployment health check passed: $slot $revision"
