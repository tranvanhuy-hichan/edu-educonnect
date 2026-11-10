export type Candidate = { id: string; code: string; fullName: string; classId: string; className: string; classRoomId: string | null };
export type SeatedCandidate = Candidate & { registrationNo: string; seatNo: number };
export type ExamGroup = { key: string; label: string; preferredRoomId: string | null; candidates: SeatedCandidate[] };
const collator = new Intl.Collator("vi", { sensitivity: "variant", numeric: true });
const nameParts = (name: string) => { const parts = name.trim().replace(/\s+/g, " ").split(" "); return [parts.at(-1) ?? "", parts.slice(1, -1).join(" "), parts.length > 1 ? parts[0] : ""]; };
export function compareCandidates(a: Candidate, b: Candidate) {
  const x = nameParts(a.fullName), y = nameParts(b.fullName);
  for (let i = 0; i < x.length; i++) { const order = collator.compare(x[i], y[i]); if (order) return order; }
  return collator.compare(a.code, b.code) || a.id.localeCompare(b.id);
}

export function groupCandidates(candidates: Candidate[], options: { grouping: "CLASS" | "ALPHABET"; roomCount: number | null; maxPerRoom: number | null }, registrations?: Map<string, string>): ExamGroup[] {
  if (!candidates.length) throw new Error("Không có học sinh đang học môn này trong khối/năm học đã chọn");
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) throw new Error("Danh sách thí sinh bị lặp");
  const sorted = [...candidates].sort(compareCandidates);
  const numbers = registrations ?? new Map(sorted.map((candidate, i) => [candidate.id, String(i + 1).padStart(4, "0")]));
  const group = (key: string, label: string, rows: Candidate[], preferredRoomId: string | null): ExamGroup => ({ key, label, preferredRoomId, candidates: rows.map((row, index) => ({ ...row, registrationNo: numbers.get(row.id)!, seatNo: index + 1 })) });
  if (options.grouping === "CLASS") {
    const classes = [...new Set(sorted.map((candidate) => candidate.classId))].sort((a, b) => collator.compare(sorted.find((candidate) => candidate.classId === a)!.className, sorted.find((candidate) => candidate.classId === b)!.className));
    return classes.map((id) => { const rows = sorted.filter((candidate) => candidate.classId === id); return group(`class:${id}`, `Lớp ${rows[0].className}`, rows, rows[0].classRoomId); });
  }
  const max = options.maxPerRoom;
  if (max !== null && (!Number.isInteger(max) || max < 1)) throw new Error("Số thí sinh tối đa/phòng phải là số nguyên dương");
  const count = max ? Math.ceil(sorted.length / max) : options.roomCount;
  if (!count || !Number.isInteger(count) || count < 1 || count > sorted.length || count > 200) throw new Error("Nhập số phòng hợp lệ hoặc số thí sinh tối đa/phòng (tối đa 200 phòng)");
  const size = Math.floor(sorted.length / count), extra = sorted.length % count;
  let offset = 0;
  return Array.from({ length: count }, (_, index) => { const rows = sorted.slice(offset, offset + size + Number(index < extra)); offset += rows.length; return group(`alphabet:${index + 1}`, `Phòng thi ${String(index + 1).padStart(2, "0")}`, rows, null); });
}

/** datetime-local fields are interpreted as school time (UTC+7), independent of the host. */
export function examDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Chọn ngày và giờ bắt đầu thi hợp lệ");
  const date = new Date(`${value}:00+07:00`);
  if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== value) throw new Error("Ngày giờ thi không hợp lệ");
  return date;
}
export function examTime(value: Date | string) { return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }); }
export function localExamTime(value: Date | string) { return new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16); }
export function timeOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }) { return a.start < b.end && b.start < a.end; }
export type Reservation = { label: string; start: Date; end: Date; roomId: string | null; teachers: string[]; students: string[] };
export function reservationConflict(a: Reservation, b: Reservation) {
  if (!timeOverlap(a, b)) return null;
  if (a.roomId && a.roomId === b.roomId) return "phòng thi";
  if (a.teachers.some((id) => b.teachers.includes(id))) return "giám thị";
  if (a.students.some((id) => b.students.includes(id))) return "học sinh";
  return null;
}
