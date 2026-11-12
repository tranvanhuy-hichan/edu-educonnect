-- Tách Admin: tài khoản dùng chung thuộc vai trò chỉ dành cho Cổng thông tin Đoàn (ADMIN, DEPARTMENT_ACCOUNT)
-- không bao giờ được gắn với hồ sơ EduConnect. Ép ở tầng DB (Prisma không biểu diễn được trigger),
-- ngoài kiểm tra lúc đăng nhập ở ứng dụng.
CREATE OR REPLACE FUNCTION edu.enforce_account_role() RETURNS trigger AS $$
DECLARE r text;
BEGIN
  SELECT role::text INTO r FROM public."User" WHERE id = NEW."accountId";
  IF r IN ('ADMIN', 'DEPARTMENT_ACCOUNT') THEN
    RAISE EXCEPTION 'Tài khoản % (vai trò %) chỉ thuộc Cổng thông tin Đoàn, không được gắn với EduConnect', NEW."accountId", r
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_account_role_guard ON edu."User";
CREATE TRIGGER user_account_role_guard BEFORE INSERT OR UPDATE OF "accountId" ON edu."User"
  FOR EACH ROW EXECUTE FUNCTION edu.enforce_account_role();
