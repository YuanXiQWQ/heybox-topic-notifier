#!/usr/bin/env bash
# 数据库在内存中导出并加密，上传后下载校验密文摘要，失败时保留本地文件。
set -euo pipefail
umask 077

# 配置和工作目录由独立的备份服务账号管理。
backup_dir=/var/lib/heybox-backup/archives
config_file=/var/lib/heybox-backup/rclone.conf
public_key=/usr/local/share/heybox/backup-public.spki
remote=backup:heybox-encrypted-backups
mkdir -p "$backup_dir"
exec 9>"$backup_dir/.lock"
flock -n 9 || exit 0

# 文件名使用 UTC 与随机后缀，重复运行不会覆盖已有快照。
name="heybox-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4).hnb"
archive="$backup_dir/$name"
/usr/local/bin/deno run --cached-only --frozen --allow-env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN --allow-net --allow-read="$public_key" --allow-write="$backup_dir" scripts/database_backup.ts export "$public_key" "$archive"
/usr/local/bin/rclone --config "$config_file" copyto "$archive" "$remote/$name" --retries 3 --low-level-retries 5 --log-level ERROR

# 下载仅包含密文，不需要在服务器保存解密私钥。
local_hash=$(sha256sum "$archive" | cut -d ' ' -f 1)
remote_hash=$(/usr/local/bin/rclone --config "$config_file" cat "$remote/$name" --log-level ERROR | sha256sum | cut -d ' ' -f 1)
if [[ "$local_hash" != "$remote_hash" ]]; then
    echo 'Encrypted backup upload verification failed.' >&2
    exit 1
fi
printf '%s\n' "$local_hash" > "$archive.verified"
printf '%s\n' "Encrypted backup uploaded and verified: $name"
