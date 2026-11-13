-- Prerequisite owned by Cổng Đoàn: prisma/independent-officers.sql (presidentId on public.Department).
-- Each application can run without the other web server; Cổng Đoàn also supports public-only databases.
CREATE OR REPLACE FUNCTION edu.sync_president_to_doan() RETURNS trigger AS $$
DECLARE account text; prev text;
BEGIN
  IF coalesce(current_setting('app.president_sync',true),'')='1' OR NEW."departmentId" IS NULL OR
    NOT EXISTS(SELECT 1 FROM edu."AcademicYear" WHERE id=NEW."academicYearId" AND "schoolYear"=edu.cur_school_year()) THEN RETURN NEW; END IF;
  IF NEW."monitorStudentId" IS NOT NULL THEN
    SELECT u."accountId" INTO account FROM edu."Student" s JOIN edu."User" u ON u.id=s."userId" WHERE s.id=NEW."monitorStudentId";
    IF NOT EXISTS(SELECT 1 FROM public."Member" WHERE "userId"=account AND "departmentId"=NEW."departmentId" AND status::text='ACTIVE') THEN
      RAISE EXCEPTION 'Lớp trưởng phải là học sinh đang hoạt động của lớp'; END IF;
  END IF;
  prev:=coalesce(current_setting('app.president_sync',true),''); PERFORM set_config('app.president_sync','1',true);
  UPDATE public."Department" SET "presidentId"=account,"updatedAt"=now() WHERE id=NEW."departmentId" AND "presidentId" IS DISTINCT FROM account;
  PERFORM set_config('app.president_sync',prev,true); RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION edu.sync_president_to_edu() RETURNS trigger AS $$
DECLARE st text; sc text; prev text;
BEGIN
  IF coalesce(current_setting('app.president_sync',true),'')='1' THEN RETURN NEW; END IF;
  prev:=coalesce(current_setting('app.president_sync',true),'');
  BEGIN
    SELECT c.id INTO sc FROM edu."SchoolClass" c JOIN edu."AcademicYear" y ON y.id=c."academicYearId" WHERE c."departmentId"=NEW.id AND y."schoolYear"=edu.cur_school_year();
    IF sc IS NULL THEN RETURN NEW; END IF;
    IF NEW."presidentId" IS NOT NULL THEN
      SELECT s.id INTO st FROM edu."Student" s JOIN edu."User" u ON u.id=s."userId" JOIN edu."StudentClassEnrollment" e ON e."studentId"=s.id WHERE u."accountId"=NEW."presidentId" AND e."schoolClassId"=sc;
      IF st IS NULL THEN RAISE EXCEPTION 'Chưa có hồ sơ/xếp lớp của lớp trưởng bên EduConnect'; END IF;
    END IF;
    PERFORM set_config('app.president_sync','1',true);
    UPDATE edu."SchoolClass" SET "monitorStudentId"=st WHERE id=sc AND "monitorStudentId" IS DISTINCT FROM st;
  EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('president→edu',SQLERRM); END;
  PERFORM set_config('app.president_sync',prev,true); RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_president_to_doan ON edu."SchoolClass";
CREATE TRIGGER sync_president_to_doan AFTER INSERT OR UPDATE OF "monitorStudentId" ON edu."SchoolClass" FOR EACH ROW EXECUTE FUNCTION edu.sync_president_to_doan();
DROP TRIGGER IF EXISTS sync_president_to_edu ON public."Department";
CREATE TRIGGER sync_president_to_edu AFTER INSERT OR UPDATE OF "presidentId" ON public."Department" FOR EACH ROW EXECUTE FUNCTION edu.sync_president_to_edu();
-- Preserve already assigned current class presidents when upgrading.
CREATE OR REPLACE FUNCTION edu.backfill_presidents() RETURNS void AS $$
BEGIN
UPDATE public."Department" d SET "presidentId"=u."accountId"
 FROM edu."SchoolClass" c JOIN edu."AcademicYear" y ON y.id=c."academicYearId" JOIN edu."Student" s ON s.id=c."monitorStudentId" JOIN edu."User" u ON u.id=s."userId"
 WHERE c."departmentId"=d.id AND y."schoolYear"=edu.cur_school_year() AND d."presidentId" IS NULL;

END $$ LANGUAGE plpgsql;
SELECT edu.backfill_presidents();
