-- (1) Lớp và chi đoàn là một: xoá lớp (EduConnect) → chi đoàn bị xoá mềm theo; xoá chi đoàn đang gắn với lớp bị chặn, phải xoá lớp trước;
--     khôi phục lớp từ thùng rác → chi đoàn được khôi phục. Xoá mềm = Department."deletedAt" (kèm graduatedAt để mọi danh sách "đang học" tự ẩn).
-- (1b) Học sinh và đoàn viên cũng vậy: xoá học sinh (EduConnect) → đoàn viên bị xoá mềm theo (Member."deletedAt"); khôi phục học sinh → khôi phục đoàn viên;
--      xoá đoàn viên đang là học sinh bị chặn, phải xoá học sinh trước.
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

-- ───────────── (1) Lớp = chi đoàn: xoá mềm và khôi phục ─────────────
-- Cột xoá mềm của chi đoàn do Cổng Đoàn sở hữu (prisma/schema.prisma của khkt, bản sao ở prisma/vendor). Phải có trước khi chạy migration này:
--   ALTER TABLE public."Department" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Department' AND column_name = 'deletedAt') THEN
    RAISE EXCEPTION 'Thiếu cột public."Department"."deletedAt" (thuộc Cổng Đoàn). Chạy: ALTER TABLE public."Department" ADD COLUMN "deletedAt" TIMESTAMP(3);';
  END IF;
END $$;

DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Member' AND column_name IN ('deletedAt', 'deletedFromStatus')) < 2 THEN
    RAISE EXCEPTION 'Thiếu cột public."Member"."deletedAt"/"deletedFromStatus" (thuộc Cổng Đoàn). Chạy: ALTER TABLE public."Member" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "deletedFromStatus" public."MemberStatus";';
  END IF;
END $$;

-- Xoá mềm một chi đoàn: gỡ ban cán sự, khóa tài khoản chung, đặt deletedAt + graduatedAt (ẩn khỏi mọi danh sách). Còn đoàn viên đang hoạt động thì không xoá (trả false).
CREATE OR REPLACE FUNCTION edu.soft_delete_department(did text) RETURNS boolean AS $$
DECLARE d public."Department"%ROWTYPE; ts timestamp := now();
BEGIN
  SELECT * INTO d FROM public."Department" WHERE id = did FOR UPDATE;
  IF NOT FOUND OR d."deletedAt" IS NOT NULL OR d."isTeacher" THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public."Member" WHERE "departmentId" = did AND status::text = 'ACTIVE') THEN RETURN false; END IF;
  UPDATE public."User" SET role = 'MEMBER', "updatedAt" = ts WHERE role::text IN ('SECRETARY', 'MONITOR')
     AND (id = d."secretaryId" OR id IN (SELECT "userId" FROM public."DepartmentMonitor" WHERE "departmentId" = did));
  DELETE FROM public."DepartmentMonitor" WHERE "departmentId" = did;
  -- graduatedAt = deletedAt khi chi đoàn chưa ra trường: khi khôi phục biết có được mở lại hay không
  UPDATE public."Department" SET "deletedAt" = ts, "graduatedAt" = coalesce("graduatedAt", ts), "secretaryId" = NULL, "presidentId" = NULL, "updatedAt" = ts WHERE id = did;
  IF d."accountId" IS NOT NULL THEN UPDATE public."User" SET status = 'LOCKED', "updatedAt" = ts WHERE id = d."accountId"; END IF;
  RETURN true;
END $$ LANGUAGE plpgsql;

-- EduConnect xoá lớp (chi đoàn không còn lớp nào khác): chi đoàn còn đoàn viên đang sinh hoạt thì chặn xoá lớp, ngược lại xoá mềm chi đoàn.
CREATE OR REPLACE FUNCTION edu.sync_class_deleted() RETURNS trigger AS $$
DECLARE prev text; k int; dn text;
BEGIN
  IF NOT edu.sync_on() OR OLD."departmentId" IS NULL THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM edu."SchoolClass" WHERE "departmentId" = OLD."departmentId" AND id <> OLD.id) THEN RETURN OLD; END IF;
  SELECT name INTO dn FROM public."Department" WHERE id = OLD."departmentId";
  SELECT count(*) INTO k FROM public."Member" WHERE "departmentId" = OLD."departmentId" AND status::text = 'ACTIVE';
  IF k > 0 THEN
    RAISE EXCEPTION 'Chi đoàn của lớp % còn % đoàn viên đang sinh hoạt. Hãy chuyển học sinh sang lớp khác (hoặc cho thôi sinh hoạt) trước khi xóa lớp.', OLD."className", k USING ERRCODE = '23503';
  END IF;
  prev := edu.syncing_begin();
  BEGIN PERFORM edu.soft_delete_department(OLD."departmentId");
  EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('delete.class', coalesce(dn, '') || ': ' || SQLERRM || ' [' || SQLSTATE || ']'); END;
  PERFORM edu.syncing_end(prev);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_class_deleted ON edu."SchoolClass";
CREATE TRIGGER sync_class_deleted BEFORE DELETE ON edu."SchoolClass" FOR EACH ROW EXECUTE FUNCTION edu.sync_class_deleted();

-- Lớp được tạo lại (khôi phục từ thùng rác, hoặc tạo lớp trùng tên + khóa với chi đoàn đã xoá mềm) → chi đoàn được khôi phục.
-- Chỉ mở lại chi đoàn khi nó bị đóng bởi việc xoá (graduatedAt = deletedAt); chi đoàn đã ra trường từ trước thì giữ nguyên trạng thái đó.
CREATE OR REPLACE FUNCTION edu.sync_class_restored() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NEW."departmentId" IS NULL OR NOT edu.sync_on() THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Department" WHERE id = NEW."departmentId" AND "deletedAt" IS NOT NULL) THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  UPDATE public."Department" SET "graduatedAt" = CASE WHEN "graduatedAt" = "deletedAt" THEN NULL ELSE "graduatedAt" END, "deletedAt" = NULL, "updatedAt" = now()
   WHERE id = NEW."departmentId" AND "deletedAt" IS NOT NULL;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_class_restored ON edu."SchoolClass";
CREATE TRIGGER sync_class_restored AFTER INSERT ON edu."SchoolClass" FOR EACH ROW EXECUTE FUNCTION edu.sync_class_restored();

-- Cổng Đoàn xoá chi đoàn đang gắn với lớp: chặn, phải xoá lớp ở EduConnect (chi đoàn sẽ bị xoá mềm theo). Chi đoàn không gắn lớp (giáo viên, chưa liên kết) xoá như cũ.
CREATE OR REPLACE FUNCTION edu.sync_department_deleting() RETURNS trigger AS $$
BEGIN
  IF NOT edu.sync_on() THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM edu."SchoolClass" WHERE "departmentId" = OLD.id) THEN
    RAISE EXCEPTION 'Chi đoàn % là lớp của EduConnect. Hãy xóa lớp ở EduConnect trước (chi đoàn sẽ bị xóa theo).', OLD.name USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_department_deleting ON public."Department";
CREATE TRIGGER sync_department_deleting BEFORE DELETE ON public."Department" FOR EACH ROW EXECUTE FUNCTION edu.sync_department_deleting();

-- ───────────── Học sinh = đoàn viên: xoá mềm và khôi phục ─────────────
-- Xoá mềm đoàn viên: ẩn khỏi mọi danh sách (deletedAt), đang sinh hoạt thì chuyển sang "đã chuyển sinh hoạt" (kéo theo việc gỡ ban cán sự), nhớ trạng thái cũ để khôi phục.
CREATE OR REPLACE FUNCTION edu.soft_delete_member(mid text) RETURNS void AS $$
BEGIN
  UPDATE public."Member" SET "deletedFromStatus" = status, "deletedAt" = now(),
         status = CASE WHEN status::text = 'ACTIVE' THEN 'TRANSFERRED'::public."MemberStatus" ELSE status END, "updatedAt" = now()
   WHERE id = mid AND "deletedAt" IS NULL;
END $$ LANGUAGE plpgsql;

-- EduConnect xoá hồ sơ học sinh → đoàn viên liên kết bị xoá mềm.
CREATE OR REPLACE FUNCTION edu.sync_student_deleting() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() OR OLD."memberId" IS NULL THEN RETURN OLD; END IF;
  prev := edu.syncing_begin();
  PERFORM edu.soft_delete_member(OLD."memberId");
  PERFORM edu.syncing_end(prev);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_student_deleting ON edu."Student";
CREATE TRIGGER sync_student_deleting BEFORE DELETE ON edu."Student" FOR EACH ROW EXECUTE FUNCTION edu.sync_student_deleting();

-- Học sinh được tạo lại (khôi phục từ thùng rác, kèm memberId cũ) → đoàn viên được khôi phục về đúng trạng thái trước khi xoá.
CREATE OR REPLACE FUNCTION edu.sync_student_restored() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NEW."memberId" IS NULL OR NOT edu.sync_on() THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Member" WHERE id = NEW."memberId" AND "deletedAt" IS NOT NULL) THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  UPDATE public."Member" SET status = coalesce("deletedFromStatus", status), "deletedAt" = NULL, "deletedFromStatus" = NULL, "updatedAt" = now()
   WHERE id = NEW."memberId" AND "deletedAt" IS NOT NULL;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_student_restored ON edu."Student";
CREATE TRIGGER sync_student_restored AFTER INSERT ON edu."Student" FOR EACH ROW EXECUTE FUNCTION edu.sync_student_restored();

-- Cổng Đoàn xoá đoàn viên đang là học sinh: chặn, phải xoá học sinh ở EduConnect (đoàn viên sẽ bị xoá theo). Đoàn viên chưa liên kết xoá như cũ.
CREATE OR REPLACE FUNCTION edu.sync_member_deleting() RETURNS trigger AS $$
BEGIN
  IF NOT edu.sync_on() THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM edu."Student" WHERE "memberId" = OLD.id) THEN
    RAISE EXCEPTION 'Đoàn viên % là học sinh của EduConnect. Hãy xóa học sinh ở EduConnect trước (đoàn viên sẽ bị xóa theo).', OLD."fullName" USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_member_deleting ON public."Member";
CREATE TRIGGER sync_member_deleting BEFORE DELETE ON public."Member" FOR EACH ROW EXECUTE FUNCTION edu.sync_member_deleting();
