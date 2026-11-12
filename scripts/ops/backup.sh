#!/usr/bin/env bash
# Sao lưu PostgreSQL của EduConnect: pg_dump (định dạng custom, nén) -> mã hoá AES-256 -> checksum -> (tuỳ chọn) khôi phục thử.
#
#   PGURL="postgresql://..." BACKUP_PASSPHRASE="..." scripts/ops/backup.sh [--out DIR] [--verify URL_DB_TAM] [--keep N]
#
#   PGURL              Kết nối TRỰC TIẾP (cổng 5432), không phải pooler (pgbouncer không hỗ trợ pg_dump).
#   BACKUP_PASSPHRASE  Cụm mật khẩu mã hoá (>= 24 ký tự). Mất nó = mất khả năng giải mã backup. Cất ở trình quản lý mật khẩu.
#   --out DIR          Thư mục lưu (mặc định ./backups)
#   --verify URL       Khôi phục thử vào DB TRỐNG này và kiểm tra có dữ liệu. KHÔNG bao giờ trỏ vào DB thật.
#   --keep N           Giữ N bản mới nhất trong thư mục (mặc định: không xoá)
set -euo pipefail

OUT="backups"; VERIFY=""; KEEP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --verify) VERIFY="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Tham số lạ: $1" >&2; exit 2 ;;
  esac
done

: "${PGURL:?Thiếu PGURL}"
: "${BACKUP_PASSPHRASE:?Thiếu BACKUP_PASSPHRASE}"
[ "${#BACKUP_PASSPHRASE}" -ge 24 ] || { echo "BACKUP_PASSPHRASE cần >= 24 ký tự" >&2; exit 2; }
command -v pg_dump >/dev/null || { echo "Chưa cài pg_dump (postgresql-client)" >&2; exit 2; }
case "$PGURL" in *pgbouncer=true*|*:6543/*) echo "PGURL đang trỏ tới pooler (6543/pgbouncer). Dùng kết nối trực tiếp 5432." >&2; exit 2 ;; esac

mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$OUT/educonnect-$STAMP"
trap 'rm -f "$BASE.dump"' EXIT   # không bao giờ để bản chưa mã hoá lại trên đĩa, kể cả khi lỗi
umask 077

echo "→ pg_dump ($(pg_dump --version))"
# --schema=public --schema=edu: DB dùng chung với Cổng thông tin Đoàn — "public" là dữ liệu khkt (tài khoản, đoàn viên...), "edu" là dữ liệu EduConnect.
# Phải sao lưu CẢ HAI cùng lúc vì khoá ngoại edu → public. Bỏ qua schema hệ thống của Supabase (auth, storage, vault, extensions...)
# vì chúng chứa extension riêng của Supabase, không khôi phục được vào PostgreSQL thường và nhà cung cấp tự quản lý chúng.
# --no-owner/--no-privileges: khôi phục được sang máy chủ/tài khoản khác. Không đưa PGURL vào log.
pg_dump "$PGURL" --format=custom --compress=6 --schema=public --schema=edu --no-owner --no-privileges --file "$BASE.dump"
[ -s "$BASE.dump" ] || { echo "Dump rỗng" >&2; exit 1; }
pg_restore --list "$BASE.dump" >/dev/null   # cấu trúc file phải đọc được

if [ -n "$VERIFY" ]; then
  echo "→ Khôi phục thử vào DB tạm"
  # --clean --if-exists: dump có lệnh CREATE SCHEMA public/edu, mà DB trống đã có sẵn schema public.
  pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$VERIFY" "$BASE.dump"
  users="$(psql "$VERIFY" -Atc 'SELECT COUNT(*) FROM "User"')"
  migrations="$(psql "$VERIFY" -Atc "SELECT COALESCE((SELECT COUNT(*) FROM \"_prisma_migrations\"),0)" 2>/dev/null || echo 0)"
  echo "  User=$users, migrations=$migrations"
  [ "$users" -gt 0 ] || { echo "Khôi phục thử không có tài khoản nào: bản sao KHÔNG dùng được" >&2; exit 1; }
fi

echo "→ Mã hoá AES-256-CBC (PBKDF2)"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$BASE.dump" -out "$BASE.dump.enc"
rm -f "$BASE.dump"                              # không để lại bản rõ
( cd "$OUT" && sha256sum "$(basename "$BASE").dump.enc" > "$(basename "$BASE").dump.enc.sha256" )

if [ -n "$KEEP" ]; then
  ls -1t "$OUT"/educonnect-*.dump.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done
fi
echo "✓ Xong: $BASE.dump.enc ($(du -h "$BASE.dump.enc" | cut -f1))"
