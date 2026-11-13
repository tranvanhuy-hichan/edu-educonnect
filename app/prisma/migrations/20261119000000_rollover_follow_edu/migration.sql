-- Lên lớp: Cổng Đoàn đi theo EduConnect. Chi đoàn gắn liền với lớp từng năm: lớp năm mới = chi đoàn mới,
-- đoàn viên chuyển theo xếp lớp EduConnect, ban cán sự đi theo học sinh sang chi đoàn/lớp mới, chi đoàn cũ được đóng.
-- Idempotent; chạy lại an toàn.

-- Chụp chức danh của đoàn viên TRƯỚC khi chuyển chi đoàn (trigger sync_clear_departed_officer sẽ gỡ chức khi đổi chi đoàn).
CREATE OR REPLACE FUNCTION edu.officer_snapshot(mid text) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'secretary', EXISTS(SELECT 1 FROM public."Department" d JOIN public."Member" m ON m."userId" = d."secretaryId" WHERE m.id = mid),
    'monitor', EXISTS(SELECT 1 FROM public."DepartmentMonitor" dm JOIN public."Member" m ON m."userId" = dm."userId" WHERE m.id = mid),
    'president', EXISTS(SELECT 1 FROM edu."SchoolClass" c JOIN edu."AcademicYear" y ON y.id = c."academicYearId" AND y."schoolYear" = edu.cur_school_year() - 1
                         JOIN edu."Student" s ON s.id = c."monitorStudentId" WHERE s."memberId" = mid),
    'deputy', EXISTS(SELECT 1 FROM edu."ClassAcademicDeputy" d JOIN edu."SchoolClass" c ON c.id = d."schoolClassId"
                      JOIN edu."AcademicYear" y ON y.id = c."academicYearId" AND y."schoolYear" = edu.cur_school_year() - 1
                      JOIN edu."Student" s ON s.id = d."studentId" WHERE s."memberId" = mid))
$$ LANGUAGE sql STABLE;

-- Gán lại chức danh ở chi đoàn/lớp mới nếu chỗ đó còn trống (mỗi chi đoàn một bí thư, mỗi lớp một lớp trưởng).
CREATE OR REPLACE FUNCTION edu.officer_restore(mid text, snap jsonb, did text) RETURNS void AS $$
DECLARE m public."Member"%ROWTYPE; sc text; st text;
BEGIN
  SELECT * INTO m FROM public."Member" WHERE id = mid;
  IF NOT FOUND OR m.status::text <> 'ACTIVE' OR m."departmentId" IS DISTINCT FROM did THEN RETURN; END IF;
  IF coalesce((snap->>'secretary')::boolean, false) AND m."isDoanVien"
     AND NOT EXISTS (SELECT 1 FROM public."DepartmentMonitor" WHERE "userId" = m."userId")
     AND EXISTS (SELECT 1 FROM public."Department" WHERE id = did AND "secretaryId" IS NULL) THEN
    UPDATE public."Department" SET "secretaryId" = m."userId", "updatedAt" = now() WHERE id = did;
    UPDATE public."User" SET role = 'SECRETARY', "updatedAt" = now() WHERE id = m."userId" AND role::text IN ('MEMBER', 'MONITOR');
  ELSIF coalesce((snap->>'monitor')::boolean, false)
     AND NOT EXISTS (SELECT 1 FROM public."Department" WHERE "secretaryId" = m."userId")
     AND NOT EXISTS (SELECT 1 FROM public."DepartmentMonitor" WHERE "userId" = m."userId") THEN
    INSERT INTO public."DepartmentMonitor"(id, "userId", "departmentId") VALUES (edu.new_id(), m."userId", did);
    UPDATE public."User" SET role = 'MONITOR', "updatedAt" = now() WHERE id = m."userId" AND role::text = 'MEMBER';
  END IF;
  SELECT c.id INTO sc FROM edu."SchoolClass" c JOIN edu."AcademicYear" y ON y.id = c."academicYearId"
   WHERE c."departmentId" = did AND y."schoolYear" = edu.cur_school_year();
  IF sc IS NULL THEN RETURN; END IF;
  SELECT s.id INTO st FROM edu."Student" s JOIN edu."StudentClassEnrollment" e ON e."studentId" = s.id AND e."schoolClassId" = sc WHERE s."memberId" = mid;
  IF st IS NULL THEN RETURN; END IF;
  IF coalesce((snap->>'president')::boolean, false) THEN
    UPDATE edu."SchoolClass" SET "monitorStudentId" = st WHERE id = sc AND "monitorStudentId" IS NULL;
  END IF;
  IF coalesce((snap->>'deputy')::boolean, false) THEN
    INSERT INTO edu."ClassAcademicDeputy"(id, "schoolClassId", "studentId") VALUES (edu.new_id(), sc, st) ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.apply_department(did text) RETURNS void AS $$
DECLARE d public."Department"%ROWTYPE; cur int := edu.cur_school_year(); g int; ay text; gl text; sc text;
BEGIN
  SELECT * INTO d FROM public."Department" WHERE id = did;
  IF NOT FOUND OR d."isTeacher" OR d."startYear" IS NULL OR d."graduatedAt" IS NOT NULL THEN RETURN; END IF;
  g := 10 + cur - d."startYear";
  IF g NOT BETWEEN 10 AND 12 THEN RETURN; END IF;
  SELECT id INTO ay FROM edu."AcademicYear" WHERE "schoolYear" = cur;
  IF ay IS NULL THEN RETURN; END IF;
  gl := edu.grade_level_id(g);
  SELECT id INTO sc FROM edu."SchoolClass" WHERE "departmentId" = d.id AND "academicYearId" = ay;
  IF sc IS NULL THEN
    SELECT id INTO sc FROM edu."SchoolClass" WHERE "academicYearId" = ay AND "className" = d.name AND "departmentId" IS NULL AND "gradeLevelId" = gl;
    IF sc IS NOT NULL THEN UPDATE edu."SchoolClass" SET "departmentId" = d.id, "gradeLevelId" = gl WHERE id = sc; END IF;
  END IF;
  -- Khi EduConnect đang quyết định lên lớp (sync_rollover đặt app.rollover_edu): chi đoàn đã có lớp ở năm khác thì không tự sinh lớp mới,
  -- lớp năm mới do EduConnect tạo. Khi Cổng Đoàn tự chuyển năm (không có lớp EduConnect cho năm mới) thì vẫn tự sinh lớp như trước.
  IF sc IS NULL AND coalesce(current_setting('app.rollover_edu', true), '') = '1'
     AND EXISTS (SELECT 1 FROM edu."SchoolClass" WHERE "departmentId" = d.id) THEN RETURN; END IF;
  IF sc IS NULL THEN
    INSERT INTO edu."SchoolClass"(id, "className", "gradeLevelId", "academicYearId", "departmentId") VALUES (edu.new_id(), d.name, gl, ay, d.id);
  ELSE
    UPDATE edu."SchoolClass" SET "className" = d.name, "gradeLevelId" = gl
     WHERE id = sc AND ("className" <> d.name OR "gradeLevelId" <> gl);
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.sync_enrollment_to_khkt() RETURNS trigger AS $$
DECLARE snap jsonb; prev text; ay_sy int; did text; st edu."Student"%ROWTYPE; acc text; arole text; uname text; mid text; cid text;
BEGIN
  IF NOT edu.sync_on() THEN RETURN NEW; END IF;
  SELECT "schoolYear" INTO ay_sy FROM edu."AcademicYear" WHERE id = NEW."academicYearId";
  IF ay_sy IS DISTINCT FROM edu.cur_school_year() THEN RETURN NEW; END IF;
  SELECT "departmentId" INTO did FROM edu."SchoolClass" WHERE id = NEW."schoolClassId";
  IF did IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO st FROM edu."Student" WHERE id = NEW."studentId";
  prev := edu.syncing_begin();
  cid := edu.ensure_class(did);
  IF st."memberId" IS NULL THEN
    SELECT u."accountId" INTO acc FROM edu."User" u WHERE u.id = st."userId";
    SELECT role::text, username INTO arole, uname FROM public."User" WHERE id = acc;
    IF arole = 'EXTERNAL' THEN UPDATE public."User" SET role = 'MEMBER'::public."Role", "updatedAt" = now() WHERE id = acc;
    ELSIF arole NOT IN ('MEMBER', 'SECRETARY', 'MONITOR') THEN
      PERFORM edu.syncing_end(prev); RETURN NEW;   -- tài khoản Admin/Chi đoàn của khkt: không bao giờ thành học sinh
    END IF;
    mid := edu.new_id();
    INSERT INTO public."Member"(id, code, "userId", "fullName", gender, "dateOfBirth", "isDoanVien", "classId", "departmentId", "qrToken", "updatedAt")
      VALUES (mid, coalesce(st.code, uname), acc, st."fullName", edu.gender_to_doan(st.gender), st.dob, false, cid, did, edu.new_id(), now());
    UPDATE edu."Student" SET "memberId" = mid WHERE id = st.id;
  ELSE
    snap := edu.officer_snapshot(st."memberId");
    UPDATE public."Member" SET "departmentId" = did, "classId" = cid, "updatedAt" = now()
     WHERE id = st."memberId" AND ("departmentId" <> did OR "classId" <> cid);
    IF FOUND THEN PERFORM edu.officer_restore(st."memberId", snap, did); END IF;
  END IF;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.sync_reconcile() RETURNS TABLE(moved_to_doan int, enrolled_in_edu int, issues bigint) AS $$
DECLARE snap jsonb; cur int := edu.cur_school_year(); ay text; prev text; r record; n1 int := 0; n2 int := 0;
BEGIN
  IF NOT edu.sync_on() THEN RETURN QUERY SELECT 0, 0, (SELECT count(*) FROM edu."SyncIssue"); RETURN; END IF;
  SELECT id INTO ay FROM edu."AcademicYear" WHERE "schoolYear" = cur;
  IF ay IS NULL THEN RETURN QUERY SELECT 0, 0, (SELECT count(*) FROM edu."SyncIssue"); RETURN; END IF;
  prev := edu.syncing_begin();
  -- lớp của mọi chi đoàn còn học (kể cả vừa đổi tên lúc chuyển năm)
  FOR r IN SELECT id FROM public."Department" WHERE NOT "isTeacher" AND "startYear" IS NOT NULL AND "graduatedAt" IS NULL LOOP
    BEGIN PERFORM edu.apply_department(r.id);
    EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('reconcile.class', SQLERRM || ' [' || SQLSTATE || ']'); END;
  END LOOP;
  -- (1) EduConnect thắng
  FOR r IN
    SELECT m.id AS member_id, sc."departmentId" AS did
      FROM edu."StudentClassEnrollment" e
      JOIN edu."SchoolClass" sc ON sc.id = e."schoolClassId" AND sc."departmentId" IS NOT NULL
      JOIN edu."Student" s ON s.id = e."studentId" AND s."memberId" IS NOT NULL
      JOIN public."Member" m ON m.id = s."memberId" AND m.status::text = 'ACTIVE' AND m."departmentId" <> sc."departmentId"
     WHERE e."academicYearId" = ay
  LOOP
    BEGIN
      snap := edu.officer_snapshot(r.member_id);
      UPDATE public."Member" SET "departmentId" = r.did, "classId" = edu.ensure_class(r.did), "updatedAt" = now() WHERE id = r.member_id;
      PERFORM edu.officer_restore(r.member_id, snap, r.did);
      n1 := n1 + 1;
    EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('reconcile.member→doan', SQLERRM || ' [' || SQLSTATE || ']'); END;
  END LOOP;
  -- (2) Cổng Đoàn thắng cho người chưa có xếp lớp
  FOR r IN
    SELECT m.id AS member_id
      FROM public."Member" m
      JOIN edu."Student" s ON s."memberId" = m.id
     WHERE m.status::text = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM edu."StudentClassEnrollment" e WHERE e."studentId" = s.id AND e."academicYearId" = ay)
       AND EXISTS (SELECT 1 FROM edu."SchoolClass" sc WHERE sc."departmentId" = m."departmentId" AND sc."academicYearId" = ay)
  LOOP
    BEGIN PERFORM edu.apply_member(r.member_id); n2 := n2 + 1;
    EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('reconcile.member→edu', SQLERRM || ' [' || SQLSTATE || ']'); END;
  END LOOP;
  PERFORM edu.syncing_end(prev);
  RETURN QUERY SELECT n1, n2, (SELECT count(*) FROM edu."SyncIssue");
END $$ LANGUAGE plpgsql;

-- Chuyển năm học theo EduConnect (cron hằng ngày):
--   1. mỗi lớp năm hiện hành chưa có chi đoàn → tạo/nối chi đoàn (trigger sync_class_to_khkt),
--   2. đối soát: đoàn viên chuyển theo xếp lớp, ban cán sự đi theo,
--   3. đóng chi đoàn cũ không còn lớp: khóa cuối cấp thì cho ra trường; chi đoàn còn người chưa xếp lớp thì giữ lại và ghi SyncIssue.
CREATE OR REPLACE FUNCTION edu.sync_rollover() RETURNS TABLE(linked int, moved_to_doan int, enrolled_in_edu int, retired int, graduated int, unplaced int, issues bigint) AS $$
DECLARE cur int := edu.cur_school_year(); ay text; r record; rec record; k int;
        n_link int := 0; n_ret int := 0; n_grad int := 0; n_unp int := 0;
BEGIN
  IF NOT edu.sync_on() THEN RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, (SELECT count(*) FROM edu."SyncIssue"); RETURN; END IF;
  SELECT id INTO ay FROM edu."AcademicYear" WHERE "schoolYear" = cur;
  IF ay IS NULL THEN RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, (SELECT count(*) FROM edu."SyncIssue"); RETURN; END IF;
  PERFORM set_config('app.rollover_edu', '1', true);
  -- 1. nối/tạo chi đoàn cho lớp năm hiện hành
  FOR r IN SELECT id FROM edu."SchoolClass" WHERE "academicYearId" = ay AND "departmentId" IS NULL LOOP
    BEGIN
      UPDATE edu."SchoolClass" SET "className" = "className" WHERE id = r.id;
      IF EXISTS (SELECT 1 FROM edu."SchoolClass" WHERE id = r.id AND "departmentId" IS NOT NULL) THEN n_link := n_link + 1; END IF;
    EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('rollover.link', SQLERRM || ' [' || SQLSTATE || '] ' || r.id); END;
  END LOOP;
  -- 2. đối soát (chuyển đoàn viên, giữ ban cán sự)
  SELECT * INTO rec FROM edu.sync_reconcile();
  -- 3. đóng chi đoàn cũ (chỉ khi năm hiện hành đã có lớp, tránh đóng nhầm khi EduConnect chưa tạo lớp)
  IF EXISTS (SELECT 1 FROM edu."SchoolClass" WHERE "academicYearId" = ay) THEN
    FOR r IN SELECT d.id, d."startYear", d."accountId", d.name FROM public."Department" d
              WHERE NOT d."isTeacher" AND d."graduatedAt" IS NULL AND d."startYear" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM edu."SchoolClass" c WHERE c."departmentId" = d.id AND c."academicYearId" = ay) LOOP
      BEGIN
        IF 10 + (cur - 1) - r."startYear" >= 12 THEN
          UPDATE public."Member" SET status = 'GRADUATED', "updatedAt" = now() WHERE "departmentId" = r.id AND status::text = 'ACTIVE';
          UPDATE public."User" SET status = 'LOCKED', "updatedAt" = now() WHERE id IN (SELECT "userId" FROM public."Member" WHERE "departmentId" = r.id);
          n_grad := n_grad + 1;
        ELSE
          SELECT count(*) INTO k FROM public."Member" WHERE "departmentId" = r.id AND status::text = 'ACTIVE';
          IF k > 0 THEN
            n_unp := n_unp + k;
            PERFORM edu.sync_issue('rollover.unplaced', k || ' đoàn viên của ' || r.name || ' chưa được xếp lớp năm mới; chi đoàn được giữ lại');
            CONTINUE;
          END IF;
          n_ret := n_ret + 1;
        END IF;
        UPDATE public."User" SET role = 'MEMBER', "updatedAt" = now() WHERE role::text IN ('SECRETARY', 'MONITOR')
           AND (id IN (SELECT "secretaryId" FROM public."Department" WHERE id = r.id) OR id IN (SELECT "userId" FROM public."DepartmentMonitor" WHERE "departmentId" = r.id));
        DELETE FROM public."DepartmentMonitor" WHERE "departmentId" = r.id;
        UPDATE public."Department" SET "graduatedAt" = now(), "secretaryId" = NULL, "presidentId" = NULL, "updatedAt" = now() WHERE id = r.id;
        IF r."accountId" IS NOT NULL THEN UPDATE public."User" SET status = 'LOCKED', "updatedAt" = now() WHERE id = r."accountId"; END IF;
      EXCEPTION WHEN OTHERS THEN PERFORM edu.sync_issue('rollover.retire', SQLERRM || ' [' || SQLSTATE || '] ' || r.name); END;
    END LOOP;
  ELSE
    PERFORM edu.sync_issue('rollover.noclasses', 'Năm học hiện hành chưa có lớp ở EduConnect; chưa đóng chi đoàn cũ');
  END IF;
  PERFORM set_config('app.rollover_edu', '', true);
  RETURN QUERY SELECT n_link, rec.moved_to_doan, rec.enrolled_in_edu, n_ret, n_grad, n_unp, (SELECT count(*) FROM edu."SyncIssue");
END $$ LANGUAGE plpgsql;
