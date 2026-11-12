#!/usr/bin/env bash
# Áp dụng migration của EduConnect (CHỈ schema "edu") lên DB dùng chung với Cổng thông tin Đoàn.
# Không dùng `prisma migrate deploy`: Prisma kiểm tra mọi schema và từ chối vì "public" (của khkt) không rỗng.
# Lịch sử lưu ở edu."_prisma_migrations" (Prisma bỏ qua bảng này khi so schema, nên không bao giờ bị coi là bảng thừa).
#   DIRECT_URL=postgresql://... bash scripts/db-deploy.sh        (an toàn khi chạy lặp lại)
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${DIRECT_URL:-${DATABASE_URL:-}}"; [ -n "$URL" ] || { echo "Thiếu DIRECT_URL" >&2; exit 1; }
URL="${URL%%\?*}"   # bỏ tham số ?schema=...
node scripts/check-migrations-edu-only.mjs
STATUS=0; [ "${1:-}" = "--status" ] && STATUS=1   # --status: chỉ liệt kê, KHÔNG ghi gì
P=(psql "$URL" -v ON_ERROR_STOP=1 -q -At)
if [ "$STATUS" = 0 ]; then "${P[@]}" -c 'CREATE SCHEMA IF NOT EXISTS edu' -c 'CREATE TABLE IF NOT EXISTS edu."_prisma_migrations"(id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)'; fi
applied=0
for d in $(ls -1 prisma/migrations | grep -E '^[0-9]{14}_' | sort); do
  f="prisma/migrations/$d/migration.sql"; [ -f "$f" ] || continue
  if [ "$("${P[@]}" -c "SELECT 1 FROM edu.\"_prisma_migrations\" WHERE migration_name='$d' AND finished_at IS NOT NULL" 2>/dev/null || true)" = "1" ]; then echo "  = $d (đã áp dụng)"; continue; fi
  if [ "$STATUS" = 1 ]; then echo "  ? $d (chờ áp dụng)"; continue; fi
  echo "  + $d"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  { echo "BEGIN;"; cat "$f"; echo; echo "INSERT INTO edu.\"_prisma_migrations\"(id,checksum,migration_name,finished_at,applied_steps_count) VALUES (gen_random_uuid()::text,'$sum','$d',now(),1);"; echo "COMMIT;"; } | psql "$URL" -v ON_ERROR_STOP=1 -q -f -
  applied=$((applied+1))
done
echo "✓ xong ($applied migration mới)"
