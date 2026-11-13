-- (1) Xoá ở một bên không để lại bản ghi mồ côi ở bên kia: lan truyền dưới dạng "lưu trữ"/chặn có thông báo.
-- (2) Chặn cứng ở database quyền ghi dữ liệu dùng chung của Cổng Đoàn (edu."DoanWritePolicy"), theo vai trò kết nối.
-- Idempotent; chạy lại an toàn.

-- ───────────── (2) Chặn quyền ghi theo vai trò kết nối ─────────────
-- edu."SyncSetting"."doanRole": tên vai trò (role) PostgreSQL mà Cổng Đoàn dùng để kết nối. NULL = chưa bật chặn cứng (chặn ở ứng dụng vẫn hoạt động).
-- Vì sao theo vai trò: hai ứng dụng dùng chung database, chỉ có danh tính kết nối mới phân biệt được người ghi mà không phụ thuộc mã ứng dụng.
ALTER TABLE "edu"."SyncSetting" ADD COLUMN IF NOT EXISTS "doanRole" TEXT;

CREATE OR REPLACE FUNCTION edu.doan_write_allowed(domain text) RETURNS boolean AS $$
DECLARE r text; ok boolean;
BEGIN
  IF domain NOT IN ('years', 'classes', 'placement', 'profiles') THEN RETURN true; END IF;
  SELECT "doanRole" INTO r FROM edu."SyncSetting" WHERE id = 1 AND enabled;
  IF r IS NULL OR session_user::text <> r THEN RETURN true; END IF;                       -- không phải kết nối của Cổng Đoàn / chưa cấu hình
  IF coalesce(current_setting('app.syncing', true), '') = '1' THEN RETURN true; END IF;   -- hàm đồng bộ của hệ thống
  IF to_regclass('edu."DoanWritePolicy"') IS NULL THEN RETURN true; END IF;
  EXECUTE format('SELECT %I FROM edu."DoanWritePolicy" WHERE id = 1', domain) INTO ok;
  RETURN coalesce(ok, true);
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION edu.require_doan_write(domain text) RETURNS void AS $$
BEGIN
  IF NOT edu.doan_write_allowed(domain) THEN
    RAISE EXCEPTION 'Dữ liệu do EduConnect quản lý (%). Nhờ quản trị viên EduConnect thực hiện hoặc cấp quyền ở Cấu hình → Cổng Đoàn.', domain USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION edu.guard_doan_schoolyear() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  PERFORM edu.require_doan_write('years');
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.guard_doan_department() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW."isTeacher" THEN PERFORM edu.require_doan_write('classes'); END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT OLD."isTeacher" THEN PERFORM edu.require_doan_write('classes'); END IF;
    RETURN OLD;
  END IF;
  IF NOT NEW."isTeacher" AND (NEW.name IS DISTINCT FROM OLD.name OR NEW."startYear" IS DISTINCT FROM OLD."startYear") THEN PERFORM edu.require_doan_write('classes'); END IF;
  IF NEW."graduatedAt" IS DISTINCT FROM OLD."graduatedAt" THEN PERFORM edu.require_doan_write('placement'); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.guard_doan_member() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM edu.require_doan_write('profiles'); PERFORM edu.require_doan_write('placement');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM edu.require_doan_write('profiles');
    RETURN OLD;
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code OR NEW."fullName" IS DISTINCT FROM OLD."fullName" OR NEW.gender IS DISTINCT FROM OLD.gender
     OR NEW."dateOfBirth" IS DISTINCT FROM OLD."dateOfBirth" THEN PERFORM edu.require_doan_write('profiles'); END IF;
  IF NEW."departmentId" IS DISTINCT FROM OLD."departmentId" THEN PERFORM edu.require_doan_write('placement'); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Tên "sync_a_guard_*": tiền tố sync_ (quy ước cho trigger trên bảng dùng chung) và "a" để chạy trước sync_department_deleting (BEFORE chạy theo thứ tự tên).
DROP TRIGGER IF EXISTS sync_a_guard_schoolyear ON public."SchoolYear";
CREATE TRIGGER sync_a_guard_schoolyear BEFORE INSERT OR UPDATE OR DELETE ON public."SchoolYear" FOR EACH ROW EXECUTE FUNCTION edu.guard_doan_schoolyear();
DROP TRIGGER IF EXISTS sync_a_guard_department ON public."Department";
CREATE TRIGGER sync_a_guard_department BEFORE INSERT OR UPDATE OR DELETE ON public."Department" FOR EACH ROW EXECUTE FUNCTION edu.guard_doan_department();
DROP TRIGGER IF EXISTS sync_a_guard_member ON public."Member";
CREATE TRIGGER sync_a_guard_member BEFORE INSERT OR UPDATE OR DELETE ON public."Member" FOR EACH ROW EXECUTE FUNCTION edu.guard_doan_member();

-- Lối vào chuyển năm học: kiểm tra quyền "placement" ngay từ đầu (tránh chạy dở rồi mới bị chặn ở bước đóng chi đoàn).
DO $$ BEGIN
  IF to_regprocedure('edu.sync_rollover_run()') IS NULL AND to_regprocedure('edu.sync_rollover()') IS NOT NULL THEN
    ALTER FUNCTION edu.sync_rollover() RENAME TO sync_rollover_run;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION edu.sync_rollover() RETURNS TABLE(linked int, moved_to_doan int, enrolled_in_edu int, retired int, graduated int, unplaced int, issues bigint) AS $$
BEGIN
  PERFORM edu.require_doan_write('placement');
  RETURN QUERY SELECT * FROM edu.sync_rollover_run();
END $$ LANGUAGE plpgsql;

-- ───────────── (1) Xoá lan truyền dưới dạng lưu trữ ─────────────
-- Đóng (lưu trữ) một chi đoàn: gỡ ban cán sự, khóa tài khoản chung, đặt graduatedAt. Chi đoàn còn đoàn viên đang hoạt động thì giữ nguyên và ghi SyncIssue.
CREATE OR REPLACE FUNCTION edu.archive_department(did text) RETURNS boolean AS $$
DECLARE d public."Department"%ROWTYPE; k int;
BEGIN
  SELECT * INTO d FROM public."Department" WHERE id = did FOR UPDATE;
  IF NOT FOUND OR d."graduatedAt" IS NOT NULL OR d."isTeacher" THEN RETURN false; END IF;
  SELECT count(*) INTO k FROM public."Member" WHERE "departmentId" = did AND status::text = 'ACTIVE';
  IF k > 0 THEN
    PERFORM edu.sync_issue('archive.department', 'Lớp của chi đoàn ' || d.name || ' đã bị xóa nhưng chi đoàn còn ' || k || ' đoàn viên đang hoạt động; chi đoàn được giữ lại');
    RETURN false;
  END IF;
  UPDATE public."User" SET role = 'MEMBER', "updatedAt" = now() WHERE role::text IN ('SECRETARY', 'MONITOR')
     AND (id = d."secretaryId" OR id IN (SELECT "userId" FROM public."DepartmentMonitor" WHERE "departmentId" = did));
  DELETE FROM public."DepartmentMonitor" WHERE "departmentId" = did;
  UPDATE public."Department" SET "graduatedAt" = now(), "secretaryId" = NULL, "presidentId" = NULL, "updatedAt" = now() WHERE id = did;
  IF d."accountId" IS NOT NULL THEN UPDATE public."User" SET status = 'LOCKED', "updatedAt" = now() WHERE id = d."accountId"; END IF;
  RETURN true;
END $$ LANGUAGE plpgsql;

-- EduConnect xóa lớp (chi đoàn không còn lớp nào) → lưu trữ chi đoàn.
CREATE OR REPLACE FUNCTION edu.sync_class_deleted() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() OR OLD."departmentId" IS NULL THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM edu."SchoolClass" WHERE "departmentId" = OLD."departmentId" AND id <> OLD.id) THEN RETURN OLD; END IF;
  prev := edu.syncing_begin();
  BEGIN PERFORM edu.archive_department(OLD."departmentId");
  EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('archive.class_deleted', SQLERRM || ' [' || SQLSTATE || ']'); END;
  PERFORM edu.syncing_end(prev);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_class_deleted ON edu."SchoolClass";
CREATE TRIGGER sync_class_deleted BEFORE DELETE ON edu."SchoolClass" FOR EACH ROW EXECUTE FUNCTION edu.sync_class_deleted();

-- Cổng Đoàn xóa chi đoàn → xóa lớp EduConnect tương ứng nếu lớp trống; lớp có dữ liệu thì chặn và báo rõ (không để lớp mồ côi bị tạo lại chi đoàn).
CREATE OR REPLACE FUNCTION edu.sync_department_deleting() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() THEN RETURN OLD; END IF;
  prev := edu.syncing_begin();
  BEGIN
    DELETE FROM edu."SchoolClass" WHERE "departmentId" = OLD.id;
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM edu.syncing_end(prev);
    RAISE EXCEPTION 'Chi đoàn % gắn với lớp có dữ liệu ở EduConnect (học sinh, phân công, thời khóa biểu...). Hãy đóng (lưu trữ) chi đoàn thay vì xóa.', OLD.name USING ERRCODE = '23503';
  END;
  PERFORM edu.syncing_end(prev);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_department_deleting ON public."Department";
CREATE TRIGGER sync_department_deleting BEFORE DELETE ON public."Department" FOR EACH ROW EXECUTE FUNCTION edu.sync_department_deleting();

-- EduConnect xóa hồ sơ học sinh → đoàn viên liên kết được lưu trữ (đã chuyển sinh hoạt), không để đoàn viên mất liên kết mà vẫn "đang sinh hoạt".
CREATE OR REPLACE FUNCTION edu.sync_student_deleting() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() OR OLD."memberId" IS NULL THEN RETURN OLD; END IF;
  prev := edu.syncing_begin();
  UPDATE public."Member" SET status = 'TRANSFERRED', "updatedAt" = now() WHERE id = OLD."memberId" AND status::text = 'ACTIVE';
  PERFORM edu.syncing_end(prev);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_student_deleting ON edu."Student";
CREATE TRIGGER sync_student_deleting BEFORE DELETE ON edu."Student" FOR EACH ROW EXECUTE FUNCTION edu.sync_student_deleting();
