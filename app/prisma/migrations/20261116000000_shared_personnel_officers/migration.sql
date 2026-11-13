-- A shared teacher may be a school union leader; student and super-admin identities stay isolated.
CREATE OR REPLACE FUNCTION edu.enforce_account_role() RETURNS trigger AS $$
DECLARE a public."User"%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public."User" WHERE id = NEW."accountId";
  IF a.role::text = 'DEPARTMENT_ACCOUNT' OR (a.role::text = 'ADMIN' AND
    (a."superAdmin" OR NOT EXISTS (SELECT 1 FROM edu."Teacher" t WHERE t."userId"=NEW.id)
      OR 'STUDENT'::edu."Role"=ANY(NEW.roles))) THEN
    RAISE EXCEPTION 'Tài khoản chỉ thuộc Cổng thông tin Đoàn; chỉ giáo viên được liên kết quyền BCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- One command used by both applications. Actor identifiers must come from the verified server session.
CREATE OR REPLACE FUNCTION edu.assign_union_leader(actor_source text, actor_id text, target_account text, title text)
RETURNS void AS $$
DECLARE a public."User"%ROWTYPE; eu edu."User"%ROWTYPE; teacher_name text;
BEGIN
  IF actor_source='edu' THEN
    IF NOT EXISTS(SELECT 1 FROM edu."User" u JOIN public."User" p ON p.id=u."accountId"
      WHERE u.id=actor_id AND u."isActive" AND p.status::text='ACTIVE' AND 'ADMIN'::edu."Role"=ANY(u.roles)) THEN
      RAISE EXCEPTION 'Không có quyền quản lý nhân sự'; END IF;
  ELSIF actor_source='doan' THEN
    IF NOT EXISTS(SELECT 1 FROM public."User" WHERE id=actor_id AND role::text='ADMIN' AND "superAdmin" AND status::text='ACTIVE') THEN
      RAISE EXCEPTION 'Chỉ quản trị tối cao được quản lý BCH'; END IF;
  ELSE RAISE EXCEPTION 'Nguồn thao tác không hợp lệ'; END IF;
  SELECT * INTO a FROM public."User" WHERE id=target_account FOR UPDATE;
  IF NOT FOUND OR a."superAdmin" OR a.role::text NOT IN ('ADMIN','EXTERNAL') THEN
    RAISE EXCEPTION 'Tài khoản không phù hợp để phân công BCH'; END IF;
  SELECT * INTO eu FROM edu."User" WHERE "accountId"=target_account FOR UPDATE;
  SELECT "fullName" INTO teacher_name FROM edu."Teacher" WHERE "userId"=eu.id;
  IF teacher_name IS NULL OR 'STUDENT'::edu."Role"=ANY(eu.roles) THEN
    RAISE EXCEPTION 'Chỉ chọn nhân sự có hồ sơ giáo viên EduConnect'; END IF;
  IF title IS NOT NULL AND (length(trim(title))<2 OR length(trim(title))>60) THEN
    RAISE EXCEPTION 'Chức danh phải dài từ 2 đến 60 ký tự'; END IF;
  IF title IS NOT NULL AND (NOT eu."isActive" OR a.status::text<>'ACTIVE') THEN
    RAISE EXCEPTION 'Không thể bổ nhiệm tài khoản đang khóa'; END IF;
  UPDATE public."User" SET role=CASE WHEN title IS NULL THEN 'EXTERNAL'::public."Role" ELSE 'ADMIN'::public."Role" END,
    position=trim(title), "fullName"=teacher_name, "updatedAt"=now() WHERE id=target_account;
  INSERT INTO edu."ActivityLog" (id,"actorEmail",action,"targetType","targetId","beforeData","afterData")
    VALUES (edu.new_id(),actor_source||':'||actor_id,CASE WHEN title IS NULL THEN 'union_leader.revoke' ELSE 'union_leader.assign' END,'SharedAccount',target_account,jsonb_build_object('role',a.role,'position',a.position),jsonb_build_object('role',CASE WHEN title IS NULL THEN 'EXTERNAL' ELSE 'ADMIN' END,'position',trim(title)));
END $$ LANGUAGE plpgsql;

-- Shared class offices. The existing department links remain the source for secretary/red monitors;
-- EduConnect SchoolClass.monitorStudentId remains the source for class president. No Edu roles are granted.
CREATE OR REPLACE FUNCTION edu.assign_class_officer(actor_source text, actor_id text, did text, office text, member_id text, remove_office boolean DEFAULT false)
RETURNS void AS $$
DECLARE d public."Department"%ROWTYPE; m public."Member"%ROWTYPE; a public."User"%ROWTYPE; sc text; st text; previous jsonb;
BEGIN
  IF actor_source='edu' THEN
    IF NOT EXISTS(SELECT 1 FROM edu."User" u JOIN public."User" p ON p.id=u."accountId" WHERE u.id=actor_id
      AND u."isActive" AND p.status::text='ACTIVE' AND 'ADMIN'::edu."Role"=ANY(u.roles)) THEN
      RAISE EXCEPTION 'Chỉ quản trị hệ thống được bổ nhiệm ban cán sự dùng chung'; END IF;
  ELSIF actor_source='doan' THEN
    IF NOT EXISTS(SELECT 1 FROM public."User" WHERE id=actor_id AND role::text='ADMIN' AND status::text='ACTIVE') THEN
      RAISE EXCEPTION 'Không có quyền bổ nhiệm'; END IF;
  ELSE RAISE EXCEPTION 'Nguồn thao tác không hợp lệ'; END IF;
  IF office NOT IN ('SECRETARY','RED_MONITOR','PRESIDENT') THEN RAISE EXCEPTION 'Chức danh không hợp lệ'; END IF;
  SELECT * INTO d FROM public."Department" WHERE id=did FOR UPDATE;
  IF NOT FOUND OR d."graduatedAt" IS NOT NULL OR (d."isTeacher" AND office='PRESIDENT') OR
    (NOT d."isTeacher" AND (10+edu.cur_school_year()-d."startYear" NOT BETWEEN 10 AND 12 OR d."startYear" IS NULL)) THEN
    RAISE EXCEPTION 'Chỉ sửa ban cán sự lớp đang học'; END IF;
  IF NOT remove_office THEN
    SELECT * INTO m FROM public."Member" WHERE id=member_id AND "departmentId"=did AND status::text='ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Học sinh không thuộc lớp hoặc đã ngừng hoạt động'; END IF;
    SELECT * INTO a FROM public."User" WHERE id=m."userId" FOR UPDATE;
    IF a.status::text<>'ACTIVE' OR a.role::text NOT IN ('MEMBER','SECRETARY','MONITOR') THEN
      RAISE EXCEPTION 'Tài khoản không phù hợp'; END IF;
    IF office='SECRETARY' AND NOT m."isDoanVien" THEN RAISE EXCEPTION 'Bí thư phải là đoàn viên'; END IF;
    IF office='SECRETARY' AND EXISTS(SELECT 1 FROM public."DepartmentMonitor" WHERE "userId"=m."userId") THEN
      RAISE EXCEPTION 'Hãy gỡ chức cờ đỏ trước khi bổ nhiệm bí thư'; END IF;
    IF office='RED_MONITOR' AND (a.role::text='SECRETARY' OR EXISTS(SELECT 1 FROM public."Department" WHERE "secretaryId"=m."userId")) THEN
      RAISE EXCEPTION 'Bí thư không kiêm cờ đỏ'; END IF;
  END IF;
  previous := jsonb_build_object('secretaryId',d."secretaryId",'monitors',
    (SELECT coalesce(jsonb_agg("userId"),'[]'::jsonb) FROM public."DepartmentMonitor" WHERE "departmentId"=did),
    'presidentStudentId',(SELECT c."monitorStudentId" FROM edu."SchoolClass" c JOIN edu."AcademicYear" y ON y.id=c."academicYearId" WHERE c."departmentId"=did AND y."schoolYear"=edu.cur_school_year()));
  IF office='SECRETARY' THEN
    IF d."secretaryId" IS NOT NULL THEN
      UPDATE public."User" SET role='MEMBER',"updatedAt"=now() WHERE id=d."secretaryId" AND role::text='SECRETARY';
    END IF;
    UPDATE public."Department" SET "secretaryId"=CASE WHEN remove_office THEN NULL ELSE m."userId" END,"updatedAt"=now() WHERE id=did;
    IF NOT remove_office THEN UPDATE public."User" SET role='SECRETARY',"updatedAt"=now() WHERE id=m."userId"; END IF;
  ELSIF office='RED_MONITOR' THEN
    IF remove_office THEN
      DELETE FROM public."DepartmentMonitor" WHERE "departmentId"=did AND "userId" IN (SELECT "userId" FROM public."Member" WHERE id=member_id) RETURNING "userId" INTO st;
      IF st IS NULL THEN RAISE EXCEPTION 'Không tìm thấy cờ đỏ trong lớp'; END IF;
      UPDATE public."User" SET role='MEMBER',"updatedAt"=now() WHERE id=st AND role::text='MONITOR';
    ELSE
      INSERT INTO public."DepartmentMonitor"(id,"userId","departmentId") VALUES(edu.new_id(),m."userId",did);
      UPDATE public."User" SET role='MONITOR',"updatedAt"=now() WHERE id=m."userId";
    END IF;
  ELSE
    SELECT c.id INTO sc FROM edu."SchoolClass" c JOIN edu."AcademicYear" y ON y.id=c."academicYearId"
      WHERE c."departmentId"=did AND y."schoolYear"=edu.cur_school_year();
    IF sc IS NULL THEN RAISE EXCEPTION 'Chưa có lớp hiện hành ở EduConnect'; END IF;
    IF NOT remove_office THEN
      SELECT s.id INTO st FROM edu."Student" s JOIN edu."StudentClassEnrollment" e ON e."studentId"=s.id
        WHERE s."memberId"=member_id AND e."schoolClassId"=sc;
      IF st IS NULL THEN RAISE EXCEPTION 'Học sinh chưa được xếp vào lớp EduConnect'; END IF;
    END IF;
    UPDATE edu."SchoolClass" SET "monitorStudentId"=CASE WHEN remove_office THEN NULL ELSE st END WHERE id=sc;
  END IF;
  INSERT INTO edu."ActivityLog"(id,"actorEmail",action,"targetType","targetId","beforeData","afterData") VALUES
    (edu.new_id(),actor_source||':'||actor_id,'class_officer.'||office||CASE WHEN remove_office THEN '.remove' ELSE '.assign' END,'Department',did,previous,jsonb_build_object('office',office,'memberId',member_id,'removed',remove_office));
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_account_role_guard ON edu."User";
CREATE TRIGGER user_account_role_guard BEFORE INSERT OR UPDATE OF "accountId", roles ON edu."User"
  FOR EACH ROW EXECUTE FUNCTION edu.enforce_account_role();

CREATE OR REPLACE FUNCTION edu.sync_account_role_guard() RETURNS trigger AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM edu."User" u WHERE u."accountId"=NEW.id AND
    (NEW.role::text='DEPARTMENT_ACCOUNT' OR (NEW.role::text='ADMIN' AND
      (NEW."superAdmin" OR 'STUDENT'::edu."Role"=ANY(u.roles) OR NOT EXISTS(SELECT 1 FROM edu."Teacher" t WHERE t."userId"=u.id))))) THEN
    RAISE EXCEPTION 'Chỉ nhân sự giáo viên được dùng chung tài khoản BCH; không cấp chéo quyền học sinh/quản trị tối cao';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_account_role_guard ON public."User";
CREATE TRIGGER sync_account_role_guard BEFORE UPDATE OF role, "superAdmin" ON public."User"
  FOR EACH ROW EXECUTE FUNCTION edu.sync_account_role_guard();

-- Moving or deactivating a pupil must not leave rights over the old class behind.
CREATE OR REPLACE FUNCTION edu.sync_clear_departed_officer() RETURNS trigger AS $$
BEGIN
  IF OLD."departmentId" IS DISTINCT FROM NEW."departmentId" OR NEW.status::text<>'ACTIVE' THEN
    UPDATE public."Department" SET "secretaryId"=NULL,"updatedAt"=now() WHERE "secretaryId"=NEW."userId";
    DELETE FROM public."DepartmentMonitor" WHERE "userId"=NEW."userId";
    UPDATE public."User" SET role='MEMBER',"updatedAt"=now() WHERE id=NEW."userId" AND role::text IN ('SECRETARY','MONITOR');
    UPDATE edu."SchoolClass" SET "monitorStudentId"=NULL WHERE "monitorStudentId" IN
      (SELECT id FROM edu."Student" WHERE "memberId"=NEW.id)
      AND "academicYearId" IN (SELECT id FROM edu."AcademicYear" WHERE "schoolYear"=edu.cur_school_year());
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_clear_departed_officer ON public."Member";
CREATE TRIGGER sync_clear_departed_officer AFTER UPDATE OF "departmentId", status ON public."Member"
  FOR EACH ROW EXECUTE FUNCTION edu.sync_clear_departed_officer();
