#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ALUMNI_BOOK_APP_DIR:-/opt/alumni-book/app}"
DATA_ROOT="${ALUMNI_BOOK_DATA_ROOT:-/var/lib/alumni-book}"
BACKUP_DIR="${ALUMNI_BOOK_BACKUP_DIR:-/var/backups/alumni-book}"
MIN_FREE_KIB="${ALUMNI_BOOK_MIN_FREE_KIB:-5242880}"

available_kib="$(df -Pk "$DATA_ROOT" | awk 'NR == 2 {print $4}')"
if [[ -z "$available_kib" || "$available_kib" -lt "$MIN_FREE_KIB" ]]; then
  echo "磁盘剩余空间不足，停止备份：${available_kib:-unknown} KiB" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot="$DATA_ROOT/data/alumni.sqlite.snapshot"
archive="$BACKUP_DIR/alumni-book-${timestamp}.tar.gz"

cleanup() {
  rm -f "$snapshot"
}
trap cleanup EXIT

docker compose --project-directory "$APP_DIR" exec -T api \
  pnpm --filter worker db:backup:local -- --destination "$snapshot"
tar -C "$(dirname "$DATA_ROOT")" -czf "$archive" "$(basename "$DATA_ROOT")/data" "$(basename "$DATA_ROOT")/uploads"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'alumni-book-*.tar.gz' -printf '%T@ %p\n' \
  | sort -nr | tail -n +8 | cut -d' ' -f2- | while IFS= read -r old_backup; do
      [[ -z "$old_backup" ]] || rm -f "$old_backup"
    done
echo "备份完成：$archive"
