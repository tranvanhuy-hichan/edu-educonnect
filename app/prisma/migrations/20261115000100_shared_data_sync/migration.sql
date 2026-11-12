-- ĐỒNG BỘ DỮ LIỆU DÙNG CHUNG với Cổng thông tin Đoàn (khkt): năm học/tuần/kỳ, lớp (= chi đoàn), học sinh và xếp lớp.
-- Hai chiều, ở tầng DB, để cả hai ứng dụng sửa dữ liệu "như bình thường" mà không đổi mã ghi ở chỗ nào.
--   * Mặc định TẮT (edu."SyncSetting".enabled = false): DB thử nghiệm/CI không bị đồng bộ. Bật bằng edu.sync_enable().
--   * Cổng Đoàn → EduConnect: lỗi chỉ ghi vào edu."SyncIssue", KHÔNG BAO GIỜ làm hỏng thao tác của Cổng Đoàn.
--   * EduConnect → Cổng Đoàn: lỗi báo thẳng cho EduConnect (rollback thao tác của EduConnect).
--   * Chống vòng lặp bằng biến app.syncing. XOÁ không được lan truyền (xoá phải làm ở từng bên).
--   * Chỉ lớp của NĂM HỌC HIỆN HÀNH được đồng bộ với chi đoàn; lớp các năm cũ giữ nguyên lịch sử.
-- Quy ước: khkt coi chi đoàn là lớp; bảng public."Class" của khkt chỉ là bản ghi phụ (mỗi chi đoàn có ≥1 "Class" để đoàn viên trỏ tới).

INSERT INTO edu."SyncSetting"(id, enabled) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION edu.new_id() RETURNS text AS $$
  SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)
$$ LANGUAGE sql VOLATILE;

CREATE OR REPLACE FUNCTION edu.sync_on() RETURNS boolean AS $$
  SELECT coalesce((SELECT enabled FROM edu."SyncSetting" WHERE id = 1), false)
     AND coalesce(current_setting('app.syncing', true), '') <> '1'
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION edu.syncing_begin() RETURNS text AS $$
DECLARE prev text := coalesce(current_setting('app.syncing', true), '');
BEGIN PERFORM set_config('app.syncing', '1', true); RETURN prev; END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.syncing_end(prev text) RETURNS void AS $$
BEGIN PERFORM set_config('app.syncing', coalesce(prev, ''), true); END $$ LANGUAGE plpgsql;

-- Năm học bắt đầu từ 01/09 giờ Việt Nam (giống khkt: lib/school-year.ts).
CREATE OR REPLACE FUNCTION edu.cur_school_year() RETURNS int AS $$
  SELECT CASE WHEN extract(month FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')) >= 9
              THEN extract(year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int
              ELSE extract(year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int - 1 END
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION edu.grade_of_name(n text) RETURNS int AS $$
  SELECT substring(n FROM '^\s*(10|11|12)')::int
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION edu.gender_to_doan(g text) RETURNS text AS $$
  SELECT CASE upper(coalesce(g, '')) WHEN 'MALE' THEN 'Nam' WHEN 'FEMALE' THEN 'Nữ' ELSE NULL END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION edu.gender_to_edu(g text) RETURNS text AS $$
  SELECT CASE lower(trim(coalesce(g, ''))) WHEN 'nam' THEN 'MALE' WHEN 'nữ' THEN 'FEMALE' WHEN 'nu' THEN 'FEMALE' ELSE NULL END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION edu.sync_issue(src text, detail text) RETURNS void AS $$
BEGIN INSERT INTO edu."SyncIssue"(source, detail) VALUES (src, left(detail, 1000)); END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.grade_level_id(g int) RETURNS text AS $$
DECLARE gid text;
BEGIN
  SELECT id INTO gid FROM edu."GradeLevel" WHERE "gradeName" = 'Khối ' || g;
  IF gid IS NULL THEN
    gid := edu.new_id();
    INSERT INTO edu."GradeLevel"(id, "gradeName", "sortOrder") VALUES (gid, 'Khối ' || g, g);
  END IF;
  RETURN gid;
END $$ LANGUAGE plpgsql;

-- "Class" chính của một chi đoàn (đoàn viên trỏ tới): ưu tiên tên trùng tên chi đoàn, rồi bản ghi cũ nhất.
CREATE OR REPLACE FUNCTION edu.primary_class(did text) RETURNS text AS $$
  SELECT c.id FROM public."Class" c JOIN public."Department" d ON d.id = c."departmentId"
   WHERE c."departmentId" = did ORDER BY (c.name = d.name) DESC, c."createdAt" ASC LIMIT 1
$$ LANGUAGE sql STABLE;

-- Như primary_class nhưng tự tạo bản ghi Class phụ nếu chi đoàn chưa có (Member.classId bắt buộc ở khkt).
CREATE OR REPLACE FUNCTION edu.ensure_class(did text) RETURNS text AS $$
DECLARE cid text; d public."Department"%ROWTYPE;
BEGIN
  cid := edu.primary_class(did);
  IF cid IS NULL THEN
    SELECT * INTO d FROM public."Department" WHERE id = did;
    cid := edu.new_id();
    INSERT INTO public."Class"(id, name, grade, "departmentId", "updatedAt")
      VALUES (cid, d.name, CASE WHEN d."startYear" IS NULL THEN NULL ELSE 10 + edu.cur_school_year() - d."startYear" END, did, now());
  END IF;
  RETURN cid;
END $$ LANGUAGE plpgsql;

-- ───────────── Năm học & tuần & kỳ ─────────────
-- (1) Cổng Đoàn → EduConnect: public."SchoolYear" (tuần 1, số tuần HK1, tổng số tuần) → AcademicYear + HK1/HK2.
CREATE OR REPLACE FUNCTION edu.sync_schoolyear_to_edu() RETURNS trigger AS $$
DECLARE prev text; v_start date; v_end date; v_s1end date; ay text; nm text;
BEGIN
  IF NOT edu.sync_on() THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  BEGIN
    v_start := NEW."week1Start"::date;
    v_end := v_start + (NEW."totalWeeks" * 7 - 1);
    v_s1end := v_start + (NEW."sem1Weeks" * 7 - 1);
    nm := NEW."startYear" || '-' || (NEW."startYear" + 1);
    SELECT id INTO ay FROM edu."AcademicYear" WHERE "schoolYear" = NEW."startYear";
    IF ay IS NULL THEN SELECT id INTO ay FROM edu."AcademicYear" WHERE "yearName" = nm; END IF;
    IF ay IS NULL THEN
      ay := edu.new_id();
      INSERT INTO edu."AcademicYear"(id, "yearName", "schoolYear", "startDate", "endDate") VALUES (ay, nm, NEW."startYear", v_start, v_end);
    ELSE
      UPDATE edu."AcademicYear" SET "schoolYear" = NEW."startYear", "startDate" = v_start, "endDate" = v_end
       WHERE id = ay AND ("schoolYear" IS DISTINCT FROM NEW."startYear" OR "startDate" <> v_start OR "endDate" <> v_end);
    END IF;
    INSERT INTO edu."AcademicTerm"(id, "academicYearId", "termName", "startDate", "endDate") VALUES (edu.new_id(), ay, 'HK1', v_start, v_s1end)
      ON CONFLICT ("academicYearId", "termName") DO UPDATE SET "startDate" = EXCLUDED."startDate", "endDate" = EXCLUDED."endDate"
      WHERE edu."AcademicTerm"."startDate" <> EXCLUDED."startDate" OR edu."AcademicTerm"."endDate" <> EXCLUDED."endDate";
    INSERT INTO edu."AcademicTerm"(id, "academicYearId", "termName", "startDate", "endDate") VALUES (edu.new_id(), ay, 'HK2', v_s1end + 1, v_end)
      ON CONFLICT ("academicYearId", "termName") DO UPDATE SET "startDate" = EXCLUDED."startDate", "endDate" = EXCLUDED."endDate"
      WHERE edu."AcademicTerm"."startDate" <> EXCLUDED."startDate" OR edu."AcademicTerm"."endDate" <> EXCLUDED."endDate";
  EXCEPTION WHEN OTHERS THEN
    PERFORM edu.sync_issue('public.SchoolYear→edu', SQLERRM || ' [' || SQLSTATE || '] startYear=' || NEW."startYear");
  END;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- (2) EduConnect → Cổng Đoàn: AcademicYear (BEFORE, vì tự gán schoolYear) → public."SchoolYear".
CREATE OR REPLACE FUNCTION edu.sync_year_to_khkt() RETURNS trigger AS $$
DECLARE prev text; m text; weeks int; s1 int;
BEGIN
  IF NOT edu.sync_on() THEN RETURN NEW; END IF;
  IF NEW."schoolYear" IS NULL THEN
    m := substring(NEW."yearName" FROM '^(\d{4})-\d{4}$');
    IF m IS NOT NULL THEN NEW."schoolYear" := m::int; END IF;
  END IF;
  IF NEW."schoolYear" IS NULL THEN RETURN NEW; END IF;
  weeks := greatest(1, ceil((NEW."endDate"::date - NEW."startDate"::date + 1) / 7.0)::int);
  SELECT greatest(1, ceil((t."endDate"::date - NEW."startDate"::date + 1) / 7.0)::int) INTO s1
    FROM edu."AcademicTerm" t WHERE t."academicYearId" = NEW.id AND t."termName" = 'HK1';
  prev := edu.syncing_begin();
  INSERT INTO public."SchoolYear"("startYear", "week1Start", "sem1Weeks", "totalWeeks")
    VALUES (NEW."schoolYear", to_char(NEW."startDate", 'YYYY-MM-DD'), coalesce(s1, 18), weeks)
    ON CONFLICT ("startYear") DO UPDATE SET "week1Start" = EXCLUDED."week1Start", "totalWeeks" = EXCLUDED."totalWeeks"
    WHERE public."SchoolYear"."week1Start" <> EXCLUDED."week1Start" OR public."SchoolYear"."totalWeeks" <> EXCLUDED."totalWeeks";
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- (3) EduConnect → Cổng Đoàn: ngày kết thúc HK1 → số tuần học kỳ 1.
CREATE OR REPLACE FUNCTION edu.sync_term_to_khkt() RETURNS trigger AS $$
DECLARE prev text; sy int; ys date; s1 int;
BEGIN
  IF NOT edu.sync_on() OR NEW."termName" <> 'HK1' THEN RETURN NEW; END IF;
  SELECT "schoolYear", "startDate"::date INTO sy, ys FROM edu."AcademicYear" WHERE id = NEW."academicYearId";
  IF sy IS NULL THEN RETURN NEW; END IF;
  s1 := greatest(1, ceil((NEW."endDate"::date - ys + 1) / 7.0)::int);
  prev := edu.syncing_begin();
  UPDATE public."SchoolYear" SET "sem1Weeks" = s1 WHERE "startYear" = sy AND "sem1Weeks" <> s1;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ───────────── Lớp (= chi đoàn) ─────────────
-- Tạo/cập nhật lớp của năm học hiện hành từ một chi đoàn (không ghi gì sang Cổng Đoàn).
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
    SELECT id INTO sc FROM edu."SchoolClass" WHERE "academicYearId" = ay AND "className" = d.name AND "departmentId" IS NULL;
    IF sc IS NOT NULL THEN UPDATE edu."SchoolClass" SET "departmentId" = d.id, "gradeLevelId" = gl WHERE id = sc; END IF;
  END IF;
  IF sc IS NULL THEN
    INSERT INTO edu."SchoolClass"(id, "className", "gradeLevelId", "academicYearId", "departmentId") VALUES (edu.new_id(), d.name, gl, ay, d.id);
  ELSE
    UPDATE edu."SchoolClass" SET "className" = d.name, "gradeLevelId" = gl
     WHERE id = sc AND ("className" <> d.name OR "gradeLevelId" <> gl);
  END IF;
END $$ LANGUAGE plpgsql;

-- (4) Cổng Đoàn → EduConnect: chi đoàn → lớp.
CREATE OR REPLACE FUNCTION edu.sync_department_to_edu() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  BEGIN
    PERFORM edu.apply_department(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM edu.sync_issue('public.Department→edu', SQLERRM || ' [' || SQLSTATE || '] ' || NEW.name);
  END;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Năm học hiện hành vừa có/được liên kết: tạo lớp cho mọi chi đoàn còn học.
CREATE OR REPLACE FUNCTION edu.sync_year_classes() RETURNS trigger AS $$
DECLARE prev text; r record;
BEGIN
  IF NOT edu.sync_on() OR NEW."schoolYear" IS DISTINCT FROM edu.cur_school_year() THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  FOR r IN SELECT id, name FROM public."Department" WHERE NOT "isTeacher" AND "startYear" IS NOT NULL AND "graduatedAt" IS NULL LOOP
    BEGIN
      PERFORM edu.apply_department(r.id);
    EXCEPTION WHEN OTHERS THEN
      PERFORM edu.sync_issue('year→classes', SQLERRM || ' [' || SQLSTATE || '] ' || r.name);
    END;
  END LOOP;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- (5) EduConnect → Cổng Đoàn: lớp → chi đoàn (+ bản ghi Class phụ). BEFORE vì tự gán departmentId.
CREATE OR REPLACE FUNCTION edu.sync_class_to_khkt() RETURNS trigger AS $$
DECLARE prev text; cur int := edu.cur_school_year(); ay_sy int; g int; sy int; did text; oldname text;
BEGIN
  IF NOT edu.sync_on() THEN RETURN NEW; END IF;
  SELECT "schoolYear" INTO ay_sy FROM edu."AcademicYear" WHERE id = NEW."academicYearId";
  IF ay_sy IS DISTINCT FROM cur THEN RETURN NEW; END IF;
  g := edu.grade_of_name(NEW."className");
  IF g IS NULL THEN SELECT substring("gradeName" FROM '(\d+)')::int INTO g FROM edu."GradeLevel" WHERE id = NEW."gradeLevelId"; END IF;
  IF g IS NULL OR g NOT BETWEEN 10 AND 12 THEN RETURN NEW; END IF;
  sy := cur - (g - 10);
  prev := edu.syncing_begin();
  did := NEW."departmentId";
  IF did IS NOT NULL THEN
    SELECT name INTO oldname FROM public."Department" WHERE id = did;
    UPDATE public."Department" SET name = NEW."className", "startYear" = sy, "updatedAt" = now()
     WHERE id = did AND (name <> NEW."className" OR "startYear" IS DISTINCT FROM sy);
    UPDATE public."Class" SET name = NEW."className", grade = g, "updatedAt" = now()
     WHERE "departmentId" = did AND name = oldname AND (name <> NEW."className" OR grade IS DISTINCT FROM g);
  ELSE
    SELECT id INTO did FROM public."Department" WHERE name = NEW."className" AND "startYear" = sy AND NOT "isTeacher" LIMIT 1;
    IF did IS NULL THEN
      did := edu.new_id();
      INSERT INTO public."Department"(id, name, "startYear", "updatedAt") VALUES (did, NEW."className", sy, now());
      INSERT INTO public."Class"(id, name, grade, "departmentId", "updatedAt") VALUES (edu.new_id(), NEW."className", g, did, now());
    END IF;
    NEW."departmentId" := did;
  END IF;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ───────────── Học sinh = đoàn viên, và xếp lớp ─────────────
-- Cổng Đoàn → EduConnect: một đoàn viên (tự nhận học sinh nếu chưa có) + xếp vào lớp hiện hành.
CREATE OR REPLACE FUNCTION edu.apply_member(mid text) RETURNS void AS $$
DECLARE m public."Member"%ROWTYPE; cur int := edu.cur_school_year(); st text; eu text; ay text; sc text; dom text;
BEGIN
  SELECT * INTO m FROM public."Member" WHERE id = mid;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT id INTO st FROM edu."Student" WHERE "memberId" = m.id;
  IF st IS NULL THEN
    SELECT id INTO st FROM edu."Student" WHERE code = m.code AND "memberId" IS NULL;
    IF st IS NOT NULL THEN UPDATE edu."Student" SET "memberId" = m.id WHERE id = st; END IF;
  END IF;
  IF st IS NULL THEN
    SELECT id INTO eu FROM edu."User" WHERE "accountId" = m."userId";
    IF eu IS NULL THEN
      SELECT "emailDomain" INTO dom FROM edu."SyncSetting" WHERE id = 1;
      eu := edu.new_id();
      INSERT INTO edu."User"(id, "accountId", email, roles, "updatedAt") VALUES (eu, m."userId", lower(m.code) || '@' || coalesce(dom, 'doan.local'), ARRAY['STUDENT']::edu."Role"[], now());
    END IF;
    st := edu.new_id();
    INSERT INTO edu."Student"(id, "userId", "memberId", code, "fullName", dob, gender)
      VALUES (st, eu, m.id, m.code, m."fullName", m."dateOfBirth", edu.gender_to_edu(m.gender));
  ELSE
    UPDATE edu."Student" SET code = m.code, "fullName" = m."fullName",
           gender = coalesce(edu.gender_to_edu(m.gender), gender), dob = coalesce(m."dateOfBirth", dob)
     WHERE id = st AND (code IS DISTINCT FROM m.code OR "fullName" <> m."fullName"
           OR gender IS DISTINCT FROM coalesce(edu.gender_to_edu(m.gender), gender) OR dob IS DISTINCT FROM coalesce(m."dateOfBirth", dob));
  END IF;
  IF m.status::text = 'ACTIVE' THEN
    SELECT id INTO ay FROM edu."AcademicYear" WHERE "schoolYear" = cur;
    SELECT id INTO sc FROM edu."SchoolClass" WHERE "departmentId" = m."departmentId" AND "academicYearId" = ay;
    IF ay IS NOT NULL AND sc IS NOT NULL THEN
      INSERT INTO edu."StudentClassEnrollment"(id, "studentId", "schoolClassId", "academicYearId") VALUES (edu.new_id(), st, sc, ay)
        ON CONFLICT ("studentId", "academicYearId") DO UPDATE SET "schoolClassId" = EXCLUDED."schoolClassId"
        WHERE edu."StudentClassEnrollment"."schoolClassId" <> EXCLUDED."schoolClassId";
    END IF;
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.sync_member_to_edu() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  BEGIN
    PERFORM edu.apply_member(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM edu.sync_issue('public.Member→edu', SQLERRM || ' [' || SQLSTATE || '] ' || NEW.code);
  END;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- EduConnect → Cổng Đoàn: hồ sơ học sinh → đoàn viên đã liên kết.
CREATE OR REPLACE FUNCTION edu.sync_student_to_khkt() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  IF NOT edu.sync_on() OR NEW."memberId" IS NULL THEN RETURN NEW; END IF;
  prev := edu.syncing_begin();
  UPDATE public."Member" SET code = coalesce(NEW.code, code), "fullName" = NEW."fullName",
         gender = coalesce(edu.gender_to_doan(NEW.gender), gender), "dateOfBirth" = coalesce(NEW.dob, "dateOfBirth"), "updatedAt" = now()
   WHERE id = NEW."memberId" AND (code IS DISTINCT FROM coalesce(NEW.code, code) OR "fullName" <> NEW."fullName"
         OR gender IS DISTINCT FROM coalesce(edu.gender_to_doan(NEW.gender), gender) OR "dateOfBirth" IS DISTINCT FROM coalesce(NEW.dob, "dateOfBirth"));
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- EduConnect → Cổng Đoàn: xếp lớp (năm hiện hành, lớp đã đồng bộ) → chi đoàn của đoàn viên. Học sinh chưa có hồ sơ đoàn viên thì tạo (thanh niên chưa vào Đoàn).
CREATE OR REPLACE FUNCTION edu.sync_enrollment_to_khkt() RETURNS trigger AS $$
DECLARE prev text; ay_sy int; did text; st edu."Student"%ROWTYPE; acc text; arole text; uname text; mid text; cid text;
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
    UPDATE public."Member" SET "departmentId" = did, "classId" = cid, "updatedAt" = now()
     WHERE id = st."memberId" AND ("departmentId" <> did OR "classId" <> cid);
  END IF;
  PERFORM edu.syncing_end(prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ───────────── Gắn trigger ─────────────
DROP TRIGGER IF EXISTS sync_schoolyear_to_edu ON public."SchoolYear";
CREATE TRIGGER sync_schoolyear_to_edu AFTER INSERT OR UPDATE ON public."SchoolYear" FOR EACH ROW EXECUTE FUNCTION edu.sync_schoolyear_to_edu();
DROP TRIGGER IF EXISTS sync_department_to_edu ON public."Department";
CREATE TRIGGER sync_department_to_edu AFTER INSERT OR UPDATE ON public."Department" FOR EACH ROW EXECUTE FUNCTION edu.sync_department_to_edu();
DROP TRIGGER IF EXISTS sync_member_to_edu ON public."Member";
CREATE TRIGGER sync_member_to_edu AFTER INSERT OR UPDATE ON public."Member" FOR EACH ROW EXECUTE FUNCTION edu.sync_member_to_edu();

DROP TRIGGER IF EXISTS sync_year_to_khkt ON edu."AcademicYear";
CREATE TRIGGER sync_year_to_khkt BEFORE INSERT OR UPDATE ON edu."AcademicYear" FOR EACH ROW EXECUTE FUNCTION edu.sync_year_to_khkt();
DROP TRIGGER IF EXISTS sync_year_classes ON edu."AcademicYear";
CREATE TRIGGER sync_year_classes AFTER INSERT OR UPDATE ON edu."AcademicYear" FOR EACH ROW EXECUTE FUNCTION edu.sync_year_classes();
DROP TRIGGER IF EXISTS sync_term_to_khkt ON edu."AcademicTerm";
CREATE TRIGGER sync_term_to_khkt AFTER INSERT OR UPDATE ON edu."AcademicTerm" FOR EACH ROW EXECUTE FUNCTION edu.sync_term_to_khkt();
DROP TRIGGER IF EXISTS sync_class_to_khkt ON edu."SchoolClass";
CREATE TRIGGER sync_class_to_khkt BEFORE INSERT OR UPDATE ON edu."SchoolClass" FOR EACH ROW EXECUTE FUNCTION edu.sync_class_to_khkt();
DROP TRIGGER IF EXISTS sync_student_to_khkt ON edu."Student";
CREATE TRIGGER sync_student_to_khkt AFTER INSERT OR UPDATE ON edu."Student" FOR EACH ROW EXECUTE FUNCTION edu.sync_student_to_khkt();
DROP TRIGGER IF EXISTS sync_enrollment_to_khkt ON edu."StudentClassEnrollment";
CREATE TRIGGER sync_enrollment_to_khkt AFTER INSERT OR UPDATE ON edu."StudentClassEnrollment" FOR EACH ROW EXECUTE FUNCTION edu.sync_enrollment_to_khkt();

-- ───────────── Bật đồng bộ + nạp ban đầu ─────────────
-- Thứ tự quan trọng: Cổng Đoàn là chuẩn → năm học, rồi lớp, rồi đoàn viên. Chạy lặp lại an toàn.
CREATE OR REPLACE FUNCTION edu.sync_backfill() RETURNS bigint AS $$
BEGIN
  UPDATE public."SchoolYear" SET "startYear" = "startYear";
  UPDATE public."Department" SET name = name;
  UPDATE public."Member" SET code = code;
  RETURN (SELECT count(*) FROM edu."SyncIssue");
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.sync_enable() RETURNS bigint AS $$
BEGIN
  UPDATE edu."SyncSetting" SET enabled = true WHERE id = 1;
  RETURN edu.sync_backfill();
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION edu.sync_disable() RETURNS void AS $$
BEGIN UPDATE edu."SyncSetting" SET enabled = false WHERE id = 1; END $$ LANGUAGE plpgsql;
