.PHONY: install migrate seed setup dev build db-reset help services services-down test test-db check backup openapi

help:
	@echo "EduConnect — các lệnh có sẵn:"
	@echo "  make setup    Cài dependency + migrate DB + seed dữ liệu test (chạy lần đầu)"
	@echo "  make install  Chỉ cài dependency (npm workspaces)"
	@echo "  make migrate  Chạy Prisma migrate (tạo/cập nhật schema DB)"
	@echo "  make seed     Seed dữ liệu test (tài khoản, lớp, môn...)"
	@echo "  make dev      Chạy EduConnect (http://localhost:3000)"
	@echo "  make build    Build production"
	@echo "  make db-reset XOÁ TOÀN BỘ DB rồi migrate + seed lại từ đầu"
	@echo "  make services Bật PostgreSQL + MinIO bằng Docker (docker-compose.yml)"
	@echo "  make check    Lint + typecheck + unit test (giống CI)"
	@echo "  make test-db  Integration test với DB thật (cần DATABASE_URL của DB DEV, đã seed)"
	@echo "  make backup   Sao lưu DB (cần PGURL, BACKUP_PASSPHRASE) — xem docs/van-hanh.md"
	@echo "  make openapi  Sinh lại docs/openapi.json"

install:
	npm install

migrate:
	npm run prisma:migrate --workspace=app

seed:
	npm run seed --workspace=app

setup: install migrate seed
	@echo ""
	@echo "Xong. Chạy 'make dev' để khởi động hệ thống."

dev:
	@echo "EduConnect: http://localhost:3000"
	npm run dev --workspace=app

build:
	npm run build --workspace=app

db-reset:
	cd app && npx prisma migrate reset --force
	$(MAKE) seed

services:
	docker compose up -d

services-down:
	docker compose down

check:
	npm run lint
	npm run typecheck
	npm test

test:
	npm test

test-db:
	npm run test:db --workspace=app

openapi:
	npm run openapi

backup:
	scripts/ops/backup.sh --out backups --keep 14
