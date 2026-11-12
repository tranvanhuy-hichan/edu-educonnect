#!/usr/bin/env bash
# Khôi phục bản sao lưu (.dump.enc) vào một DB đích.
#
#   BACKUP_PASSPHRASE="..." scripts/ops/restore.sh FILE.dump.enc "postgresql://đích" [--confirm-production]
#
# AN TOÀN: mặc định chỉ khôi phục vào DB TRỐNG. Muốn ghi đè DB đang có dữ liệu phải thêm --confirm-production
# (khi đó --clean --if-exists xoá đối tượng cũ trước). Hãy diễn tập khôi phục vào DB tạm ít nhất mỗi quý.
set -euo pipefail

FILE="${1:-}"; TARGET="${2:-}"; CONFIRM="${3:-}"
[ -f "$FILE" ] && [ -n "$TARGET" ] || { sed -n '2,8p' "$0"; exit 2; }
: "${BACKUP_PASSPHRASE:?Thiếu BACKUP_PASSPHRASE}"
case "$TARGET" in *pgbouncer=true*|*:6543/*) echo "Đích đang là pooler; dùng kết nối trực tiếp 5432." >&2; exit 2 ;; esac

if [ -f "$FILE.sha256" ]; then ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" ) || { echo "Checksum sai: file hỏng/bị sửa" >&2; exit 1; }; fi

TMP="$(mktemp --suffix=.dump)"; trap 'rm -f "$TMP"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$TMP"

existing="$(psql "$TARGET" -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")"
FLAGS=(--no-owner --no-privileges --exit-on-error)
if [ "$existing" -gt 0 ]; then
  [ "$CONFIRM" = "--confirm-production" ] || { echo "DB đích đã có $existing bảng. Thêm --confirm-production nếu chắc chắn muốn GHI ĐÈ." >&2; exit 1; }
  echo "⚠ Ghi đè DB đích sau 10 giây (Ctrl+C để huỷ)"; sleep 10
  FLAGS+=(--clean --if-exists)
fi
pg_restore "${FLAGS[@]}" --dbname "$TARGET" "$TMP"
echo "✓ Đã khôi phục. Kiểm tra: User=$(psql "$TARGET" -Atc 'SELECT COUNT(*) FROM "User"'), ActivityLog=$(psql "$TARGET" -Atc 'SELECT COUNT(*) FROM "ActivityLog"')"
echo "Bước tiếp: npm run prisma:status (đối chiếu migration), rồi kiểm tra /api/ready."
