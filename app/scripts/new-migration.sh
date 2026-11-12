#!/usr/bin/env bash
# Tạo migration mới cho schema "edu" từ thay đổi trong prisma/edu.prisma.
#   1. sửa prisma/edu.prisma   2. npm run db:schema   3. DB dev đang ở trạng thái trước thay đổi:  DIRECT_URL=... npm run db:new-migration -- ten_thay_doi
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:?Cần tên migration, vd: them_cot_abc}"; URL="${DIRECT_URL:?Thiếu DIRECT_URL (DB DEV, không phải DB thật)}"; URL="${URL%%\?*}"
node scripts/build-schema.mjs
DIR="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_${NAME}"; mkdir -p "$DIR"
npx prisma migrate diff --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --script > "$DIR/migration.sql"
if grep -q "empty migration" "$DIR/migration.sql"; then rm -rf "$DIR"; echo "Không có thay đổi."; exit 0; fi
node scripts/check-migrations-edu-only.mjs || { rm -rf "$DIR"; echo "✖ Migration chạm schema ngoài edu: đã huỷ. Sửa prisma/vendor/khkt.schema.prisma KHÔNG đúng cách; đổi bảng khkt phải làm ở dự án khkt." >&2; exit 1; }
echo "✓ Đã tạo $DIR/migration.sql — kiểm tra nội dung rồi commit."
