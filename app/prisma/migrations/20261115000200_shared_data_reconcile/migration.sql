-- ĐỐI SOÁT lúc chuyển năm học / khi cần (chạy hằng ngày, lặp lại an toàn): kéo hai bên về cùng một lớp cho năm học HIỆN HÀNH.
-- Vì sao cần: lên lớp ở EduConnect tạo xếp lớp cho NĂM SAU (chưa phải năm hiện hành nên chưa đồng bộ); đến 01/09 năm sau trở thành
-- hiện hành mà không có thao tác ghi nào để kích hoạt trigger. Quy tắc khi lệch:
--   1. Học sinh ĐÃ có xếp lớp ở EduConnect cho năm hiện hành  → EduConnect thắng: đoàn viên chuyển sang chi đoàn của lớp đó.
--   2. Đoàn viên đang học mà CHƯA có xếp lớp ở EduConnect      → Cổng Đoàn thắng: tạo xếp lớp theo chi đoàn của họ.
CREATE OR REPLACE FUNCTION edu.sync_reconcile() RETURNS TABLE(moved_to_doan int, enrolled_in_edu int, issues bigint) AS $$
DECLARE cur int := edu.cur_school_year(); ay text; prev text; r record; n1 int := 0; n2 int := 0;
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
      UPDATE public."Member" SET "departmentId" = r.did, "classId" = edu.ensure_class(r.did), "updatedAt" = now() WHERE id = r.member_id;
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
