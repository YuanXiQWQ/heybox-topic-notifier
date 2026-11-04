#!/usr/bin/env bash
# 在独立临时目录中验证归档拒绝、健康检查、回退及准备目录清理；不接触真实 systemd 或业务数据。
set -euo pipefail
source_script=$(cd -- "$(dirname -- "$0")" && pwd)/deploy.sh
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# /**
# 为一次部署创建隔离文件系统和进程边界桩。
# @param {string} $1 场景名称。
# */
prepare() {
  export DEPLOY_TEST_ROOT="$temporary/$1"
  mkdir -p "$DEPLOY_TEST_ROOT"/{root/releases/old,etc,bin,source/src,locks}
  ln -s "$DEPLOY_TEST_ROOT/root/releases/old" "$DEPLOY_TEST_ROOT/root/current"
  printf 'PUBLIC_ORIGIN=https://example.test\nPORT=8000\n' > "$DEPLOY_TEST_ROOT/etc/heybox.env"
  printf 'export {};\n' > "$DEPLOY_TEST_ROOT/source/src/self_hosted.ts"
  printf '{}\n' > "$DEPLOY_TEST_ROOT/source/deno.lock"
  tar -czf "$DEPLOY_TEST_ROOT/release.tar.gz" -C "$DEPLOY_TEST_ROOT/source" .
  digest=$(sha256sum "$DEPLOY_TEST_ROOT/release.tar.gz" | cut -d ' ' -f 1)
  /usr/bin/python3 - "$source_script" "$DEPLOY_TEST_ROOT" <<'PY'
import pathlib
import sys
source, root = sys.argv[1:]
text = pathlib.Path(source).read_text()
text = text.replace('/opt/heybox-topic-notifier', root + '/root')
text = text.replace('/etc/heybox-topic-notifier', root + '/etc')
text = text.replace('/run/lock/heybox-deploy.lock', root + '/locks/deploy.lock')
text = text.replace('/proc/$pid/cwd', root + '/process/cwd')
pathlib.Path(root, 'deploy.sh').write_text(text)
PY
  cat > "$DEPLOY_TEST_ROOT/bin/id" <<'SH'
#!/usr/bin/env bash
echo 0
SH
  cat > "$DEPLOY_TEST_ROOT/bin/runuser" <<'SH'
#!/usr/bin/env bash
exit 0
SH
  cat > "$DEPLOY_TEST_ROOT/bin/systemd-run" <<'SH'
#!/usr/bin/env bash
[[ ! -f $DEPLOY_TEST_ROOT/fail-config ]]
SH
  cat > "$DEPLOY_TEST_ROOT/bin/systemctl" <<'SH'
#!/usr/bin/env bash
if [[ $1 == restart ]]; then
  readlink "$DEPLOY_TEST_ROOT/root/current" >> "$DEPLOY_TEST_ROOT/restarts"
  if [[ -f $DEPLOY_TEST_ROOT/rate-limit ]]; then exit 1; fi
  if [[ -f $DEPLOY_TEST_ROOT/fail-start && $(readlink "$DEPLOY_TEST_ROOT/root/current") != */old ]]; then touch "$DEPLOY_TEST_ROOT/rate-limit"; exit 1; fi
  mkdir -p "$DEPLOY_TEST_ROOT/process"
  ln -sfn "$(readlink "$DEPLOY_TEST_ROOT/root/current")" "$DEPLOY_TEST_ROOT/process/cwd"
elif [[ $1 == reset-failed ]]; then
  rm -f "$DEPLOY_TEST_ROOT/rate-limit"
elif [[ $1 == show ]]; then
  echo 123
fi
exit 0
SH
  cat > "$DEPLOY_TEST_ROOT/bin/curl" <<'SH'
#!/usr/bin/env bash
echo '{"status":"ok"}'
SH
  cat > "$DEPLOY_TEST_ROOT/bin/python3" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
[[ ! -f $DEPLOY_TEST_ROOT/fail-public ]]
SH
  chmod +x "$DEPLOY_TEST_ROOT/bin/"*
}

# /**
# 在隔离命令环境执行部署，并确认退出状态符合场景。
# @param {string} $1 success 或 failure。
# */
deploy() {
  result=0
  PATH="$DEPLOY_TEST_ROOT/bin:$PATH" bash "$DEPLOY_TEST_ROOT/deploy.sh" production "$revision" "$DEPLOY_TEST_ROOT/release.tar.gz" "$digest" 3.13.2 > "$DEPLOY_TEST_ROOT/result.log" 2>&1 || result=$?
  if [[ $1 == success && $result != 0 || $1 == failure && $result == 0 ]]; then
    cat "$DEPLOY_TEST_ROOT/result.log" >&2
    exit 1
  fi
  [[ -z $(find "$DEPLOY_TEST_ROOT/root/releases" -maxdepth 1 -name '.prepare.*' -print -quit) ]]
}

prepare success
deploy success
[[ $(readlink "$DEPLOY_TEST_ROOT/root/current") == "$DEPLOY_TEST_ROOT/root/releases/$revision-3.13.2" ]]
grep -qx "APP_DEPLOYMENT_ID=$revision" "$DEPLOY_TEST_ROOT/root/current/.deploy.env"
! grep -q '^DENO_' "$DEPLOY_TEST_ROOT/root/current/.deploy.env"
grep -qx 'APP_VERSION=3.13.2' "$DEPLOY_TEST_ROOT/root/current/.deploy.env"
[[ $(cat "$DEPLOY_TEST_ROOT/root/production-deployed-sha") == "$revision" ]]
echo 'PASS: successful deployment records exact commit and version'

prepare digest
digest=$(printf '0%.0s' {1..64})
deploy failure
[[ ! -f $DEPLOY_TEST_ROOT/restarts && $(readlink "$DEPLOY_TEST_ROOT/root/current") == */old ]]
echo 'PASS: invalid archive digest never activates a release'

prepare startup
touch "$DEPLOY_TEST_ROOT/fail-start"
deploy failure
[[ $(readlink "$DEPLOY_TEST_ROOT/root/current") == */old && $(tail -1 "$DEPLOY_TEST_ROOT/restarts") == */old ]]
[[ ! -f $DEPLOY_TEST_ROOT/rate-limit ]]
[[ ! -d $DEPLOY_TEST_ROOT/root/releases/$revision-3.13.2 ]]
[[ ! -f $DEPLOY_TEST_ROOT/root/production-deployed-sha ]]
echo 'PASS: failed service startup restores the previous release'

prepare public
touch "$DEPLOY_TEST_ROOT/fail-public"
deploy failure
[[ $(readlink "$DEPLOY_TEST_ROOT/root/current") == */old && $(tail -1 "$DEPLOY_TEST_ROOT/restarts") == */old ]]
[[ ! -f $DEPLOY_TEST_ROOT/root/production-deployed-sha ]]
echo 'PASS: failed public page verification restores the previous release'

prepare invalid
rm "$DEPLOY_TEST_ROOT/source/src/self_hosted.ts"
tar -czf "$DEPLOY_TEST_ROOT/release.tar.gz" -C "$DEPLOY_TEST_ROOT/source" .
digest=$(sha256sum "$DEPLOY_TEST_ROOT/release.tar.gz" | cut -d ' ' -f 1)
deploy failure
[[ ! -f $DEPLOY_TEST_ROOT/restarts && $(readlink "$DEPLOY_TEST_ROOT/root/current") == */old ]]
echo 'PASS: incomplete release leaves no staging directory or service change'

prepare config
touch "$DEPLOY_TEST_ROOT/fail-config"
deploy failure
[[ ! -f $DEPLOY_TEST_ROOT/restarts && $(readlink "$DEPLOY_TEST_ROOT/root/current") == */old ]]
echo 'PASS: invalid runtime configuration never stops the running service'
[[ ! -d $DEPLOY_TEST_ROOT/root/releases/$revision-3.13.2 ]]
