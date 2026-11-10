import { randomInt } from "crypto";

// Bỏ các ký tự dễ nhầm: 0 O 1 l I
const CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genPassword(len = 8) {
  return Array.from({ length: len }, () => CHARS[randomInt(CHARS.length)]).join("");
}

/** Mã / tên đăng nhập học sinh: HS + 8 chữ số, vd HS48215937. */
export function genStudentCode() {
  return `HS${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

/** Mã giáo viên: GV + 6 chữ số, vd GV482159. */
export function genTeacherCode() {
  return `GV${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}
