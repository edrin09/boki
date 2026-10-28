#!/usr/bin/env bash
# P3 部署模板：市场库在线备份 + 制品同步（每日 03:20 cron）
# 库与制品必须成套备份：只有库没有 zip 会 404，只有 zip 没有库会丢授权与统计。
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
DB=/srv/boki-market/db/market.db
BACKUPS=/srv/boki-market/backups

mkdir -p "$BACKUPS"
sqlite3 "$DB" ".backup '$BACKUPS/market-$TS.db'"
sqlite3 "$BACKUPS/market-$TS.db" "PRAGMA integrity_check;"
rsync -a --delete /srv/boki-market/data/ "$BACKUPS/data-current/"
find "$BACKUPS" -name 'market-*.db' -mtime +30 -delete
