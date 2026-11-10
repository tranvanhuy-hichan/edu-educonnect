.PHONY: install migrate seed setup dev build db-reset help

help:
	@echo "EduConnect — các lệnh có sẵn:"
	@echo "  make setup    Cài dependency + migrate DB + seed dữ liệu test (chạy lần đầu)"
	@echo "  make install  Chỉ cài dependency (npm workspaces)"
	@echo "  make migrate  Chạy Prisma migrate (tạo/cập nhật schema DB)"
	@echo "  make seed     Seed dữ liệu test (tài khoản, lớp, môn...)"
	@echo "  make dev      Chạy EduConnect (http://localhost:3000)"
	@echo "  make build    Build production"
	@echo "  make db-reset XOÁ TOÀN BỘ DB rồi migrate + seed lại từ đầu"

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
